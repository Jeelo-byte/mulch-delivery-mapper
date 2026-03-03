export function getMulchColor(type: string): string {
    const defaultColors: Record<string, string> = {
        'black': '#1f2937',
        'aromatic cedar': '#d97706',
        'fine shredded hardwood': '#92400e',
    };
    const key = type.toLowerCase();
    if (defaultColors[key]) return defaultColors[key];

    let hash = 0;
    for (let i = 0; i < type.length; i++) {
        hash = type.charCodeAt(i) + ((hash << 5) - hash);
    }
    const color = `#${(hash & 0x00FFFFFF).toString(16).padStart(6, '0')}`;
    return color;
}
