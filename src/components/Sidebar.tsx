import { useState } from "preact/hooks";
import type { Category } from "../types";

interface SidebarProps {
  categories: Category[];
}

export default function Sidebar({ categories }: SidebarProps) {
  const [activeId, setActiveId] = useState<string | undefined>(
    categories[0]?.id ? String(categories[0]?.id) : undefined,
  );

  const scrollTo = (id: string) => {
    setActiveId(id);
    const el = document.getElementById(id);
    const container = document.getElementById("scrollContainer");
    if (el && container) {
      const top = el.offsetTop;
      container.scrollTo({ top: top, behavior: "smooth" });
    }
  };

  return (
    <div className="app-sidebar">
      {categories.map((cat) => (
        <div
          key={cat.id}
          className={`sidebar-item ${activeId === cat.id ? "active" : ""}`}
          onClick={() => scrollTo(String(cat.id))}
        >
          <span className="cat-name-main">{cat.name}</span>
          {cat.subName && <span className="cat-name-sub">{cat.subName}</span>}
        </div>
      ))}
    </div>
  );
}
