-- Public reads do not require EXECUTE on the admin helper. The separate
-- authenticated admin policy still permits viewing and managing every job.
alter policy "Public read published careers jobs"
on public.careers_jobs
using (status = 'published');
