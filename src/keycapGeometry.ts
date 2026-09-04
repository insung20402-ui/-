import * as THREE from "three";

// 키캡 특유의 위가 좁고 아래가 넓은 절두각뿔(frustum) 형태 지오메트리를 만듭니다.
// 그룹 0 = 윗면(사진/각인용), 그룹 1 = 아랫면, 그룹 2 = 옆면
export function buildKeycapGeometry(width: number, depth: number, height: number, taper = 0.8): THREE.BufferGeometry {
  const bw = width / 2;
  const bd = depth / 2;
  const tw = (width / 2) * taper;
  const td = (depth / 2) * taper;
  const hh = height / 2;

  const b0 = [-bw, -hh, -bd];
  const b1 = [bw, -hh, -bd];
  const b2 = [bw, -hh, bd];
  const b3 = [-bw, -hh, bd];
  const t0 = [-tw, hh, -td];
  const t1 = [tw, hh, -td];
  const t2 = [tw, hh, td];
  const t3 = [-tw, hh, td];

  const positions: number[] = [];
  const uvs: number[] = [];
  const groups: { start: number; count: number; materialIndex: number }[] = [];

  // a,b,c,d는 바깥에서 봤을 때 시계방향으로 넘기고, 여기서 CCW(바깥 방향 normal)로 뒤집어 삼각형을 만든다.
  function addQuad(a: number[], b: number[], c: number[], d: number[], uv: number[][], materialIndex: number) {
    const start = positions.length / 3;
    [a, c, b, a, d, c].forEach((p) => positions.push(...p));
    [uv[0], uv[2], uv[1], uv[0], uv[3], uv[2]].forEach((u) => uvs.push(...u));
    groups.push({ start, count: 6, materialIndex });
  }

  // 윗면 (재질 0) - 위에서 봤을 때 시계반대방향
  addQuad(t0, t1, t2, t3, [[0, 1], [1, 1], [1, 0], [0, 0]], 0);
  // 아랫면 (재질 1)
  addQuad(b3, b2, b1, b0, [[0, 0], [1, 0], [1, 1], [0, 1]], 1);
  // 옆면 4개 (재질 2)
  addQuad(b3, b2, t2, t3, [[0, 0], [1, 0], [1, 1], [0, 1]], 2); // +z
  addQuad(b1, b0, t0, t1, [[0, 0], [1, 0], [1, 1], [0, 1]], 2); // -z
  addQuad(b2, b1, t1, t2, [[0, 0], [1, 0], [1, 1], [0, 1]], 2); // +x
  addQuad(b0, b3, t3, t0, [[0, 0], [1, 0], [1, 1], [0, 1]], 2); // -x

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  groups.forEach((g) => geometry.addGroup(g.start, g.count, g.materialIndex));
  geometry.computeVertexNormals();
  return geometry;
}
