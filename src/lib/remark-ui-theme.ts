export function normalizeRemarkCategoryLabel(s: string): string {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[\/_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

export function getRemarkCategoryTheme(categoryLabel: string): {
  accent: string;
  soft: string;
  icon: string;
} {
  const n = normalizeRemarkCategoryLabel(categoryLabel);

  if (n.includes('辣') || n.includes('spicy') || n.includes('spiciness'))
    return { accent: '#ff7043', soft: 'rgba(255, 112, 67, 0.08)', icon: '🌶️' };
  if (n.includes('忌口') || n.includes('exclude') || n.includes('exclusion'))
    return { accent: '#d32f2f', soft: 'rgba(211, 47, 47, 0.08)', icon: '🚫' };
  if (n.includes('健康') || n.includes('healthy'))
    return { accent: '#4caf50', soft: 'rgba(76, 175, 80, 0.08)', icon: '🥬' };
  if (n.includes('过敏') || n.includes('allergy') || n.includes('allergies'))
    return { accent: '#ffa726', soft: 'rgba(255, 167, 38, 0.08)', icon: '⚠️' };
  if (n.includes('修改') || n.includes('modify') || n.includes('modification'))
    return { accent: '#2196f3', soft: 'rgba(33, 150, 243, 0.08)', icon: '⚙️' };

  return { accent: '#607d8b', soft: 'rgba(96, 125, 139, 0.08)', icon: '📝' };
}
