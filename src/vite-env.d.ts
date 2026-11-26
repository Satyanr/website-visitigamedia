/// <reference types="vite/client" />

declare module 'summernote/dist/summernote-lite.js';

interface JQuery<TElement = HTMLElement> {
  summernote(options?: Record<string, unknown>): JQuery<TElement>;
  summernote(command: 'code'): string;
  summernote(command: 'code', value: string): JQuery<TElement>;
  summernote(command: 'destroy'): JQuery<TElement>;
  summernote(command: 'editor.getLastRange'): { nativeRange(): Range };
  summernote(command: 'editor.setLastRange'): void;
  summernote(command: 'editor.insertNode', node: HTMLElement): void;
  summernote(command: 'editor.pasteHTML', html: string): void;
}

interface Window {
  $: JQueryStatic;
  jQuery: JQueryStatic;
}
