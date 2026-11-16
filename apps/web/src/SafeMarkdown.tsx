import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';

/**
 * Render untrusted LLM Markdown as React, never as executable HTML.
 * Raw HTML, images and non-HTTP links are deliberately disabled.
 */
export default function SafeMarkdown({source}:{source:string}){
  return <div className="ai-markdown" dir="rtl" lang="ar">
    <ReactMarkdown
      skipHtml
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeSanitize]}
      components={{
        h1:({children})=><h2 dir="auto">{children}</h2>,
        h2:({children})=><h2 dir="auto">{children}</h2>,
        h3:({children})=><h3 dir="auto">{children}</h3>,
        h4:({children})=><h4 dir="auto">{children}</h4>,
        p:({children})=><p dir="auto">{children}</p>,
        li:({children})=><li dir="auto">{children}</li>,
        blockquote:({children})=><blockquote dir="auto">{children}</blockquote>,
        code:({children,className})=><code dir="ltr" className={className}>{children}</code>,
        pre:({children})=><pre dir="ltr" tabIndex={0}>{children}</pre>,
        a:({href,children})=>{
          if(!href || !/^https?:\/\//i.test(href))return <span>{children}</span>;
          return <a href={href} target="_blank" rel="noopener noreferrer nofollow">{children}</a>;
        },
        img:()=>null,
        table:({children})=><div className="ai-table-scroll" role="region" aria-label="جدول التقرير، مرر لعرض بقية الأعمدة" tabIndex={0}><table>{children}</table></div>
      }}
    >{source}</ReactMarkdown>
  </div>;
}
