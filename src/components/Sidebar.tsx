import type { Category } from "../types";

interface SidebarProps {
  categories: Category[];
  activeId?: string;
  stickyOffsetTop?: number;
}

export default function Sidebar({ categories, activeId, stickyOffsetTop = 0 }: SidebarProps) {
  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    const container = document.getElementById("scrollContainer");
    if (el && container) {
      const top = Math.max(el.offsetTop - stickyOffsetTop, 0);
      container.scrollTo({ top, behavior: "smooth" });
    }
  };

  return (
    <div className="app-sidebar">
      {categories.map((cat) => {
        const categoryId = String(cat.id);
        return (
          <div
            key={cat.id}
            className={`sidebar-item ${activeId === categoryId ? "active" : ""}`}
            onClick={() => scrollTo(categoryId)}
          >
            <span className="cat-name-main">{cat.name}</span>
            {cat.subName && <span className="cat-name-sub">{cat.subName}</span>}
          </div>
        );
      })}
    </div>
  );
}
