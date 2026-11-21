export function localDate(value: Date | number = new Date()) {
  const date = new Date(value);
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()].map((part) => String(part).padStart(2, '0')).join('-');
}

export function localDateAtNoon(day: string) {
  return new Date(`${day}T12:00:00`);
}

export function shiftLocalDate(day: string, offset: number) {
  const date = localDateAtNoon(day);
  date.setDate(date.getDate() + offset);
  return localDate(date);
}

export function weekDays(today: Date) {
  const monday = today.getDate() - ((today.getDay() + 6) % 7);
  return Array.from({ length: 7 }, (_, index) => new Date(today.getFullYear(), today.getMonth(), monday + index));
}
