import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import test from 'node:test';

const enabled = Boolean(process.env.QWORDS_TEST_MYSQL_DATABASE);
const php = process.env.PHP_BINARY || 'php';
test('real MariaDB/MySQL HTTP integration', { skip: !enabled && process.env.QWORDS_REQUIRE_MYSQL !== 'true' ? 'Isolated test MySQL/MariaDB not configured' : false }, async () => {
  assert.ok(enabled, 'An isolated test database is required');
  const parent = resolve('.qwords-test');
  await mkdir(parent,{recursive:true});
  const root = await mkdtemp(join(parent,'mysql-feature-'));
  const publicRoot = join(root,'public_html');
  const privateRoot = join(root,'private');
  const origin = 'https://qwords-stage.example.test';
  const address = 'http://127.0.0.1:4189';
  let processServer;
  try {
    await mkdir(privateRoot);
    await mkdir(join(publicRoot,'en/about'),{recursive:true});
    await writeFile(join(publicRoot,'en/about/index.html'),'<h1>About fixture</h1>');
    const fixture = JSON.parse(execFileSync(php,['tests/qwords/mysql-fixture.php',privateRoot],{encoding:'utf8'}));
    assert.equal(fixture.heroPatchPassed, true, 'Manual patch changes only the verified hero image and is idempotent');
    processServer = spawn(php,['-S','127.0.0.1:4189','-t',publicRoot,'tests/qwords/mysql-router.php'],{
      env:{...process.env,QWORDS_TEST_PUBLIC_ROOT:publicRoot,QWORDS_TEST_PRIVATE_ROOT:privateRoot},stdio:'ignore',
    });
    let ready = false;
    for (let attempt=0;attempt<50;attempt++) {
      if (processServer.exitCode !== null) break;
      try { ready = (await fetch(address + '/en/about/')).ok; } catch { /* server starting */ }
      if (ready) break;
      await new Promise((done)=>setTimeout(done,100));
    }
    assert.ok(ready);
    let cookie = '', csrf = '';
    const http = (path,options={}) => {
      const headers = new Headers(options.headers);
      if (options.payload !== undefined) headers.set('Content-Type','application/json');
      if (options.method && options.method !== 'GET') headers.set('Origin',options.origin ?? origin);
      if (options.admin && cookie) headers.set('Cookie',cookie);
      if (options.admin && csrf && !options.noCsrf) headers.set('X-CSRF-Token',csrf);
      return fetch(address+path,{method:options.method ?? 'GET',headers,redirect:'manual',
        body:options.payload === undefined ? options.body : JSON.stringify(options.payload)});
    };
    assert.equal((await http('/api/content/contact_messages')).status,404);
    assert.equal((await http('/api/content/admin_users')).status,404);
    assert.equal((await http('/api/admin/contact_messages')).status,401);
    assert.equal((await http('/api/session',{method:'POST',origin:'https://different.example.test',payload:fixture})).status,403);
    assert.equal((await http('/api/session',{method:'POST',payload:{email:fixture.disabledEmail,password:fixture.password}})).status,401);
    const signedIn = await http('/api/session',{method:'POST',payload:{email:fixture.email,password:fixture.password}});
    assert.equal(signedIn.status,200);
    const setCookie = signedIn.headers.get('set-cookie');
    assert.match(setCookie,/secure/i); assert.match(setCookie,/HttpOnly/i); assert.match(setCookie,/SameSite=Strict/i);
    cookie = setCookie.split(';')[0];
    csrf = (await signedIn.json()).csrf;
    assert.match(csrf,/^[a-f0-9]{64}$/);
    assert.equal((await http('/api/session',{admin:true})).status,200);
    assert.equal((await http('/api/session',{admin:true,noCsrf:true,method:'DELETE'})).status,403);
    assert.equal((await http('/api/translate-content',{admin:true,method:'POST',payload:{}})).status,503);
    const suffix = randomUUID().slice(0,8);
    const slug = `mysql-fixture-${suffix}`;
    const payload = { slug,title:'Fixture news',cover_image:'/news/example.webp',content:'<p onclick="unsafe">Fixture news body</p><script>unsafe()</script>',
      author:'Fixture',category:'News',excerpt:'Fixture excerpt',seo_title:'',seo_description:'',cover_alt:'',target_keyword:'',published_at:null };
    const create = await http('/api/admin/news',{admin:true,method:'POST',payload});
    assert.equal(create.status,200);
    const createdNews = (await create.json()).rows[0];
    assert.equal(createdNews.content,'<p>Fixture news body</p>');
    const newsId = createdNews.id;
    const byId = '?filters=' + encodeURIComponent(JSON.stringify([['id','eq',newsId]]));
    assert.equal((await (await http('/api/content/news'+byId)).json()).rows.length,0);
    assert.equal((await http('/id/news/'+slug+'/')).status,404);
    const publication = await http('/api/admin/news'+byId,{admin:true,method:'PATCH',payload:{published_at:'2026-01-01T01:00:00+01:00'}});
    assert.equal(publication.status,200);
    assert.match(await (await http('/en/news/'+slug+'/')).text(),/Fixture news body/);
    assert.match(await (await http('/sitemap.xml')).text(),new RegExp(slug));
    const comment = {p_news_id:newsId,p_name:'Fixture Visitor',p_body:'Useful synthetic comment',p_honeypot:'',p_submission_key:randomUUID()};
    assert.equal((await http('/api/actions/submit_news_comment',{method:'POST',payload:comment})).status,200);
    const commentRows = await (await http('/api/content/news_comments?filters='+encodeURIComponent(JSON.stringify([['news_id','eq',newsId]])))).json();
    assert.equal(commentRows.rows[0].body,comment.p_body);
    assert.ok(!('submission_key' in commentRows.rows[0]));
    assert.equal((await http('/api/content/news?fields='+encodeURIComponent('id,(SELECT 1)'))).status,422);
    assert.equal((await http('/api/admin/news'+byId,{admin:true,method:'PATCH',noCsrf:true,payload:{title:'Blocked'}})).status,403);
    const post = { p_name:'Test Visitor',p_email:fixture.email,p_phone:null,p_message:'A synthetic contact request.',
      p_submission_key:randomUUID(),p_honeypot:'' };
    for (let index=0;index<3;index++) assert.equal((await http('/api/actions/submit_contact_message',{method:'POST',payload:post})).status,200);
    assert.equal((await http('/api/actions/submit_contact_message',{method:'POST',payload:post})).status,429);
    const now = new Date();
    const start = new Date(now.getTime() - 86400000).toISOString();
    const end = new Date(now.getTime() + 86400000).toISOString();
    const previous = new Date(now.getTime() - 3 * 86400000).toISOString();
    const overview = await http('/api/actions/admin_dashboard_summary',{admin:true,method:'POST',payload:{start,end,previous,bounds:[end]}});
    assert.equal(overview.status,200);
    assert.ok((await overview.json()).leads >= 3);
    const seed = JSON.parse(execFileSync(process.execPath,['scripts/seed-qwords.mjs'],{encoding:'utf8'})).tables;
    for (const table of ['homepage_content','about_content','service_content','product_catalogue','contact_settings','careers_page_content']) {
      const record = {...seed[table][0]};
      delete record.updated_at;
      const saved = await http('/api/admin/'+table,{admin:true,method:'PUT',payload:record});
      assert.equal(saved.status,200,table);
      assert.equal((await (await http('/api/content/'+table)).json()).rows[0].id,1,table);
    }
    const { id:_productId,created_at:_productCreated,updated_at:_productUpdated,...product } = seed.products[0];
    assert.equal((await http('/api/admin/products',{admin:true,method:'POST',payload:product})).status,200);
    const { id:_projectId,created_at:_projectCreated,updated_at:_projectUpdated,...project } = seed.portfolios[0];
    project.slug = 'project-'+suffix;
    const createdProject = await http('/api/admin/portfolios',{admin:true,method:'POST',payload:project});
    assert.equal(createdProject.status,200);
    const projectId = (await createdProject.json()).rows[0].id;
    const renamed = await http('/api/admin/portfolios?filters='+encodeURIComponent(JSON.stringify([['id','eq',projectId]])),
      {admin:true,method:'PATCH',payload:{slug:'renamed-'+suffix}});
    assert.equal(renamed.status,200);
    assert.equal((await http('/id/portfolio/'+project.slug+'/')).headers.get('location'),'/id/portfolio/renamed-'+suffix+'/');
    const landing = seed.service_landings[0], related = {p_portfolio_ids:[projectId]};
    for (const [field,value] of Object.entries(landing)) if (field !== 'updated_at') related['p_'+field] = value;
    assert.equal((await http('/api/actions/save_service_landing',{admin:true,method:'POST',payload:related})).status,200);
    const service = '/api/content/service_landings?fields='+encodeURIComponent('*,service_landing_portfolios(portfolio_id,position)');
    assert.ok((await (await http(service)).json()).rows.some((row)=>row.service_landing_portfolios[0]?.portfolio_id===projectId));
    const job = { title:'Fixture job',department:'Fixture',location:'Fixture',employment_type:'Fixture',
      description:'A private draft test',qualifications:[],responsibilities:[],deadline:null,status:'draft',sort_order:0 };
    const createdJob = await http('/api/admin/careers_jobs',{admin:true,method:'POST',payload:job});
    assert.equal(createdJob.status,200);
    const jobId = (await createdJob.json()).rows[0].id;
    const jobFilter = '?filters='+encodeURIComponent(JSON.stringify([['id','eq',jobId]]));
    assert.equal((await (await http('/api/content/careers_jobs'+jobFilter)).json()).rows.length,0);
    const submission = {...post,p_submission_key:randomUUID(),p_submission_type:'job_application',p_job_id:jobId};
    assert.equal((await http('/api/actions/submit_careers_submission',{method:'POST',payload:submission})).status,422);
    assert.equal((await http('/api/admin/careers_jobs'+jobFilter,{admin:true,method:'PATCH',payload:{status:'published'}})).status,200);
    assert.equal((await http('/api/actions/submit_careers_submission',{method:'POST',payload:submission})).status,200);
    assert.equal((await http('/api/actions/submit_careers_submission',{method:'POST',payload:{...submission,p_submission_type:'partnership'}})).status,200);
    assert.equal((await http('/api/actions/mark_careers_submissions_read',{admin:true,method:'POST',payload:{}})).status,200);
    assert.equal((await http('/api/content-export')).status,404);
    const exported = await http('/api/content-export',{headers:{'X-Qwords-Export':fixture.exportKey}});
    assert.equal(exported.status,200);
    assert.ok(!('contact_messages' in (await exported.json()).tables));
    const file = new FormData();
    const media = `news/${randomUUID()}.png`;
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
    file.set('path',media);
    file.set('file',new Blob([png],{type:'text/plain'}),'arbitrary-name.png');
    assert.equal((await http('/api/admin/media',{admin:true,method:'POST',body:file})).status,201);
    assert.equal((await http('/media/'+media,{headers:{Range:'bytes=0-7'}})).status,206);
    const bad = new FormData(); bad.set('path',`news/${randomUUID()}.png`); bad.set('file',new Blob(['ordinary text'],{type:'image/png'}),'fake.png');
    assert.equal((await http('/api/admin/media',{admin:true,method:'POST',body:bad})).status,415);
    const secondMedia = `news/${randomUUID()}.png`;
    file.set('path', secondMedia);
    assert.equal((await http('/api/admin/media',{admin:true,method:'POST',body:file})).status,201);
    const articleMedia = `<img src="/media/${media}"><img src="/media/${secondMedia}">
      <img src="https://images.example.test/photo.webp">
      <iframe src="https://youtu.be/M7lc1UVf-VE" srcdoc="unsafe" onload="unsafe()"></iframe>
      <iframe src="https://www.youtube-nocookie.com/embed/M7lc1UVf-VE"></iframe>
      <iframe src="https://vimeo.com/76979871/abcdef0123"></iframe>
      <video src="/videos/service-showreel.webm" autoplay onerror="unsafe()"></video>
      <iframe src="https://player.vimeo.com.evil.test/video/76979871"></iframe>
      <iframe src="https://www.youtube.com/watch/extra?v=M7lc1UVf-VE"></iframe>
      <img src="http://example.test/photo.webp"><img src="javascript:unsafe()"><img src="data:image/png;base64,AAAA">
      <object data="https://example.test/"></object><script>unsafe()</script>`;
    const withMedia = { content: '<p>Fixture news body</p>'+articleMedia,
      content_id: {content:'<p>Artikel Indonesia</p>'+articleMedia}, content_en: {content:'<p>English article</p>'+articleMedia} };
    const savedMedia = await http('/api/admin/news'+byId,{admin:true,method:'PATCH',payload:withMedia});
    assert.equal(savedMedia.status,200);
    const row = (await savedMedia.json()).rows[0];
    for (const body of [row.content,row.content_id.content,row.content_en.content]) {
      assert.ok(body.includes('/media/'+media));
      assert.ok(body.includes('/media/'+secondMedia));
      assert.match(body, /https:\/\/images\.example\.test\/photo\.webp/);
      assert.match(body, /https:\/\/www\.youtube\.com\/embed\/M7lc1UVf-VE/);
      assert.match(body, /https:\/\/www\.youtube-nocookie\.com\/embed\/M7lc1UVf-VE/);
      assert.match(body, /https:\/\/player\.vimeo\.com\/video\/76979871\?h=abcdef0123/);
      assert.match(body, /<video src="\/videos\/service-showreel\.webm" controls/);
      assert.doesNotMatch(body,/unsafe|srcdoc|autoplay|base64|evil\.test|http:\/\/|<object|<script/);
    }
    const resave = await http('/api/admin/news'+byId,{admin:true,method:'PATCH',payload:{
      content:row.content, content_id:row.content_id, content_en:row.content_en }});
    assert.equal(resave.status,200);
    assert.deepEqual((await resave.json()).rows[0].content_id, row.content_id);
    assert.equal((await (await http('/api/content/news'+byId)).json()).rows[0].content_en.content,row.content_en.content);
    assert.equal((await http('/api/admin/media',{admin:true,method:'DELETE',payload:{paths:[media]}})).status,409);
    assert.equal((await http('/api/admin/news'+byId,{admin:true,method:'DELETE'})).status,200);
    assert.equal((await http('/en/news/'+slug+'/')).status,404);
    assert.equal((await http('/api/admin/media',{admin:true,method:'DELETE',payload:{paths:[media]}})).status,200);
    assert.equal((await http('/api/admin/media',{admin:true,method:'DELETE',payload:{paths:[secondMedia]}})).status,200);
    const document = `documents/${randomUUID()}.png`;
    file.set('path',document); file.set('visibility','private');
    assert.equal((await http('/api/admin/media',{admin:true,method:'POST',body:file})).status,201);
    assert.equal((await http('/media/'+document)).status,404);
    assert.equal((await http('/api/admin/files/'+document)).status,401);
    assert.equal((await http('/api/admin/files/'+document,{admin:true})).status,200);
    assert.equal((await http('/api/admin/media',{admin:true,method:'DELETE',payload:{paths:[document]}})).status,200);
    const sessionFile = join(privateRoot,'sessions','sess_'+cookie.split('=')[1]);
    const active = await readFile(sessionFile,'utf8');
    await writeFile(sessionFile,active.replace(/last_activity\|i:\d+;/,'last_activity|i:1;'));
    assert.equal((await http('/api/admin/news',{admin:true})).status,401);
    const retry = await http('/api/session',{method:'POST',payload:{email:fixture.email,password:fixture.password}});
    cookie = retry.headers.get('set-cookie').split(';')[0]; csrf = (await retry.json()).csrf;
    assert.equal((await http('/api/session',{admin:true,method:'DELETE'})).status,200);
    assert.equal((await http('/api/admin/news',{admin:true})).status,401);
    const settings = join(privateRoot,'config.php');
    const original = await readFile(settings,'utf8');
    await writeFile(settings,original.replace(/'name' => '[^']+'/, "'name' => 'database_missing_for_fixture'"));
    assert.equal((await http('/api/content/news')).status,503);
    assert.equal((await http('/en/about/')).status,200);
  } finally {
    if (processServer && processServer.exitCode === null) { const stopped=once(processServer,'exit'); processServer.kill(); await stopped; }
    assert.ok(root.startsWith(parent+sep));
    await rm(root,{recursive:true,force:true});
  }
});
