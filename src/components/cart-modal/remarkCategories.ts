export interface RemarkCategory {
  name: string;
  options: string[];
}

export const REMARK_CATEGORIES: RemarkCategory[] = [
  {
    name: "辣度/Spiciness",
    options: [
      "免辣/No Spicy",
      "微辣/Mild",
      "中辣/Medium",
      "特辣/Extra Hot",
      "加辣/Add Spicy",
      "少麻/Less Numb",
      "多麻/More Numb",
      "酸甜/Sweet&Sour",
    ],
  },
  {
    name: "忌口/Exclusions",
    options: [
      "免香菜/No Coriander",
      "免葱/No Onion",
      "免蒜/No Garlic",
      "免姜/No Ginger",
      "免洋葱/No Onion",
      "免芹菜/No Celery",
      "不要豆芽/No BeanSprout",
      "免芝麻/No Sesame",
    ],
  },
  {
    name: "健康/Healthy",
    options: [
      "少油/Less Oil",
      "少盐/Less Salt",
      "免味精/No MSG",
      "少糖/Less Sugar",
      "多汁/More Sauce",
      "少汁/Less Sauce",
      "免酱油/No SoySauce",
    ],
  },
  {
    name: "其他/Others",
    options: [
      "免肉/No Meat",
      "免蛋/No Egg",
      "加蛋/Add Egg",
      "加饭/Add Rice",
      "素食/Vegetarian",
      "斋戒/Posno",
    ],
  },
];
