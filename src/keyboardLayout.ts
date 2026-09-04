// 60% ANSI 배열(61키)을 각 행(row) 단위로 정의합니다.
// u 값은 키 폭의 단위(1u = 기본 한 칸)입니다.
export interface KeySpec {
  id: string;
  label: string;
  u: number;
}

export const LAYOUT_ROWS: KeySpec[][] = [
  // 숫자 행
  [
    { id: "esc", label: "Esc", u: 1 },
    { id: "n1", label: "1", u: 1 },
    { id: "n2", label: "2", u: 1 },
    { id: "n3", label: "3", u: 1 },
    { id: "n4", label: "4", u: 1 },
    { id: "n5", label: "5", u: 1 },
    { id: "n6", label: "6", u: 1 },
    { id: "n7", label: "7", u: 1 },
    { id: "n8", label: "8", u: 1 },
    { id: "n9", label: "9", u: 1 },
    { id: "n0", label: "0", u: 1 },
    { id: "minus", label: "-", u: 1 },
    { id: "equal", label: "=", u: 1 },
    { id: "backspace", label: "Backspace", u: 2 },
  ],
  // Tab 행
  [
    { id: "tab", label: "Tab", u: 1.5 },
    { id: "q", label: "Q", u: 1 },
    { id: "w", label: "W", u: 1 },
    { id: "e", label: "E", u: 1 },
    { id: "r", label: "R", u: 1 },
    { id: "t", label: "T", u: 1 },
    { id: "y", label: "Y", u: 1 },
    { id: "u", label: "U", u: 1 },
    { id: "i", label: "I", u: 1 },
    { id: "o", label: "O", u: 1 },
    { id: "p", label: "P", u: 1 },
    { id: "lbracket", label: "[", u: 1 },
    { id: "rbracket", label: "]", u: 1 },
    { id: "backslash", label: "\\", u: 1.5 },
  ],
  // Caps 행
  [
    { id: "caps", label: "Caps", u: 1.75 },
    { id: "a", label: "A", u: 1 },
    { id: "s", label: "S", u: 1 },
    { id: "d", label: "D", u: 1 },
    { id: "f", label: "F", u: 1 },
    { id: "g", label: "G", u: 1 },
    { id: "h", label: "H", u: 1 },
    { id: "j", label: "J", u: 1 },
    { id: "k", label: "K", u: 1 },
    { id: "l", label: "L", u: 1 },
    { id: "semicolon", label: ";", u: 1 },
    { id: "quote", label: "'", u: 1 },
    { id: "enter", label: "Enter", u: 2.25 },
  ],
  // Shift 행
  [
    { id: "lshift", label: "Shift", u: 2.25 },
    { id: "z", label: "Z", u: 1 },
    { id: "x", label: "X", u: 1 },
    { id: "c", label: "C", u: 1 },
    { id: "v", label: "V", u: 1 },
    { id: "b", label: "B", u: 1 },
    { id: "n", label: "N", u: 1 },
    { id: "m", label: "M", u: 1 },
    { id: "comma", label: ",", u: 1 },
    { id: "period", label: ".", u: 1 },
    { id: "slash", label: "/", u: 1 },
    { id: "rshift", label: "Shift", u: 2.75 },
  ],
  // 스페이스 행
  [
    { id: "lctrl", label: "Ctrl", u: 1.25 },
    { id: "lwin", label: "Win", u: 1.25 },
    { id: "lalt", label: "Alt", u: 1.25 },
    { id: "space", label: "", u: 6.25 },
    { id: "ralt", label: "Alt", u: 1.25 },
    { id: "rwin", label: "Win", u: 1.25 },
    { id: "menu", label: "Menu", u: 1.25 },
    { id: "rctrl", label: "Ctrl", u: 1.25 },
  ],
];

export interface PlacedKey extends KeySpec {
  row: number;
  col: number;
  x: number; // 중심 x 좌표 (단위: u)
  z: number; // 중심 z 좌표 (row 위치)
  widthU: number;
  depthU: number;
  heightScale: number; // 행별 높이 차이(OEM 프로파일 느낌)
}

const ROW_HEIGHT_SCALE = [1.15, 1.05, 0.95, 1.0, 0.85];

export function buildKeyboard(): { keys: PlacedKey[]; totalWidthU: number; totalDepthU: number } {
  const keys: PlacedKey[] = [];
  let maxWidth = 0;
  const rowPitch = 1.0;

  LAYOUT_ROWS.forEach((row, rowIndex) => {
    const rowWidth = row.reduce((sum, k) => sum + k.u, 0);
    maxWidth = Math.max(maxWidth, rowWidth);
    let cursor = 0;
    row.forEach((key, colIndex) => {
      const centerX = cursor + key.u / 2;
      keys.push({
        ...key,
        row: rowIndex,
        col: colIndex,
        x: centerX,
        z: rowIndex * rowPitch,
        widthU: key.u,
        depthU: 1,
        heightScale: ROW_HEIGHT_SCALE[rowIndex] ?? 1,
      });
      cursor += key.u;
    });
  });

  // 행마다 폭이 다르므로 전체 폭 기준으로 중앙 정렬하고, 행(z)도 중앙 정렬
  const totalDepthU = LAYOUT_ROWS.length * rowPitch;
  const zOffset = (totalDepthU - rowPitch) / 2;
  const centeredKeys = keys.map((k) => ({ ...k, x: k.x - maxWidth / 2, z: k.z - zOffset }));

  return { keys: centeredKeys, totalWidthU: maxWidth, totalDepthU };
}
