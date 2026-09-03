/**
 * Палитра направлений — единственный список на всё приложение: раньше он был
 * продублирован в форме создания и в настройках направления, причём одни и те
 * же цвета назывались там по-разному.
 *
 * Значение — имя CSS-токена: оно хранится в базе в поле color, поэтому
 * переименовывать существующие нельзя, это данные. Порядок — по кругу тонов,
 * так сетка выбора читается спокойнее, чем при случайной раскладке.
 */
export interface DirectionColor {
  value: string;
  label: string;
}

export const DIRECTION_COLORS: DirectionColor[] = [
  { value: '--d-act', label: 'тёплый красный' },
  { value: '--d-terra', label: 'терракота' },
  { value: '--d-voice', label: 'охра' },
  { value: '--d-olive', label: 'оливковый' },
  { value: '--d-grass', label: 'травяной' },
  { value: '--d-eng', label: 'бирюзовый' },
  { value: '--d-emerald', label: 'изумрудный' },
  { value: '--d-sea', label: 'голубой' },
  { value: '--d-phys', label: 'синий' },
  { value: '--d-indigo', label: 'индиго' },
  { value: '--d-vocal', label: 'фиолетовый' },
  { value: '--d-orchid', label: 'орхидея' },
  { value: '--d-berry', label: 'ягодный' },
  { value: '--d-taupe', label: 'тауп' },
  { value: '--d-neutral', label: 'шалфей' },
  { value: '--d-slate', label: 'грифельный' },
  { value: '--d-smoke', label: 'дымчато-лиловый' },
];

/** Цвет по умолчанию для нового направления. */
export const DEFAULT_DIRECTION_COLOR = '--d-eng';
