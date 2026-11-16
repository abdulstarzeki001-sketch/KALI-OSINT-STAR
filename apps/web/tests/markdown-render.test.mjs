import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import {test} from 'node:test';
import assert from 'node:assert/strict';

// Same untrusted-Markdown parsing + sanitizing pipeline as production UI.
function render(markdown){
 return renderToStaticMarkup(React.createElement(ReactMarkdown,{
  remarkPlugins:[remarkGfm],rehypePlugins:[rehypeSanitize],skipHtml:true,
  components:{img:()=>null,a:({href,children})=>href&&/^https?:\/\//i.test(href)?React.createElement('a',{href,rel:'noopener noreferrer nofollow'},children):React.createElement('span',null,children)}
 },markdown));
}
test('Arabic bold Markdown renders as strong, not literal asterisks',()=>{
 const html=render('**ملخص التقرير**\n\nخادم `SSH` يحتاج التحقق.');
 assert.match(html,/<strong>ملخص التقرير<\/strong>/);
 assert.doesNotMatch(html,/\*\*ملخص التقرير\*\*/);
 assert.match(html,/<code>SSH<\/code>/);
});
test('GFM bullets, tables and headings are rendered',()=>{
 const html=render('## النتائج\n\n- SSH TCP/22\n- TCP/8080\n\n| خدمة | حالة |\n| --- | --- |\n| SSH | متوفر |');
 assert.match(html,/<h2>النتائج<\/h2>/);
 assert.match(html,/<ul>/);
 assert.match(html,/<table>/);
 assert.match(html,/<th>خدمة<\/th>/);
});
test('untrusted HTML tags do not become browser elements',()=>{
 const html=render('Safe\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>');
 assert.doesNotMatch(html,/<script|<img|onerror=/i);
});
test('javascript URLs and remote Markdown images cannot execute or load',()=>{
 const html=render('[click](javascript:alert(1))\n\n![tracking](https://host.example/tracker.png)');
 assert.doesNotMatch(html,/javascript:|<img|tracker\.png/i);
});
test('ordinary HTTPS links remain usable',()=>{
 const html=render('[official docs](https://example.org/docs)');
 assert.match(html,/href="https:\/\/example.org\/docs"/);
});
