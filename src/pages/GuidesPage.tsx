import { useState } from "react";
import { GUIDES, WHLK_GUIDE, type GuideBlock, type GuideDoc } from "../content/whlk";

function shot(file: string) {
  return `${import.meta.env.BASE_URL}guides/whlk/${file}`;
}

function Blocks({ blocks }: { blocks: GuideBlock[] }) {
  return (
    <>
      {blocks.map((block, index) => {
        if (block.type === "p") return <p key={index}>{block.text}</p>;
        if (block.type === "note") return <p key={index} className="guide-callout guide-note">{block.text}</p>;
        if (block.type === "warn") return <p key={index} className="guide-callout guide-warn">{block.text}</p>;
        if (block.type === "code") return <pre key={index} className="guide-code"><code>{block.text}</code></pre>;
        return (
          <figure key={index} className="guide-shots">
            {block.files.map((file) => (
              <img key={file} src={shot(file)} alt={block.caption ?? file} />
            ))}
            {block.caption && <figcaption>{block.caption}</figcaption>}
          </figure>
        );
      })}
    </>
  );
}

function GuideArticle({ guide, onBack }: { guide: GuideDoc; onBack: () => void }) {
  return (
    <article className="guide-article">
      <div className="page-head">
        <div>
          <p className="guide-kicker">教學</p>
          <h1>{guide.title}</h1>
          <p>{guide.summary}</p>
        </div>
        <button className="btn" type="button" onClick={onBack}>返回教學</button>
      </div>

      <nav className="guide-toc" aria-label="章節">
        {guide.sections.map((section) => (
          <a key={section.id} href={`#${section.id}`}>{section.title}</a>
        ))}
      </nav>

      {guide.sections.map((section) => (
        <section key={section.id} id={section.id} className="panel guide-section">
          <h2>{section.title}</h2>
          {section.intro && <p className="hint">{section.intro}</p>}
          {section.steps.map((step) => (
            <div key={`${section.id}-${step.n}`} className="guide-step">
              <h3>
                <span className="guide-step-n">{step.n}</span>
                {step.title}
              </h3>
              <Blocks blocks={step.blocks} />
            </div>
          ))}
        </section>
      ))}
    </article>
  );
}

export function GuidesPage() {
  const [guideId, setGuideId] = useState<string | null>(null);

  if (guideId === "whlk") {
    return <GuideArticle guide={WHLK_GUIDE} onBack={() => setGuideId(null)} />;
  }

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>教學</h1>
          <p>專案操作手冊。先從 BIOS WHLK 開始，之後有新文件再往這裡加。</p>
        </div>
      </div>
      <div className="guide-list">
        {GUIDES.map((guide) => (
          <button
            key={guide.id}
            className="panel guide-card"
            type="button"
            onClick={() => setGuideId(guide.id)}
          >
            <h2>{guide.title}</h2>
            <p>{guide.summary}</p>
            <span className="ok-pill">開啟</span>
          </button>
        ))}
      </div>
    </section>
  );
}
