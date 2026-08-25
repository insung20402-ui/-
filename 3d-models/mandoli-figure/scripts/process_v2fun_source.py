"""
Process the real v2fun.ai-exported Mandoli OBJ into a manufacturable STL.

Steps:
1. Load the raw OBJ (a ~50k-face soup of ~300 disconnected surface patches,
   none individually watertight -- typical of AI-generated exports).
2. Drop tiny debris fragments (<10 faces).
3. Uniform-resample (PyMeshLab, SDF-offset based) to fuse everything into a
   single closed, watertight solid while preserving fine detail (feathers,
   vest ribbing, shield emblem, etc.).
4. Keep only the main body (drop any leftover microscopic fragments).
5. Reorient from the source's Y-up convention to Z-up (3D-printing/STL
   convention), ground the feet at z=0, and scale to the target height.
"""
import os

import numpy as np
import pymeshlab
import trimesh

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SRC_OBJ = os.path.join(SCRIPT_DIR, "..", "source", "mandoli_v2fun_source.obj")
OUT_STL = os.path.join(SCRIPT_DIR, "..", "stl")
WORK_DIR = os.path.join(SCRIPT_DIR, "..", "source", "_work")
os.makedirs(OUT_STL, exist_ok=True)
os.makedirs(WORK_DIR, exist_ok=True)

TARGET_HEIGHT_MM = 220.0
CELLSIZE_PCT = 0.35


def main():
    m = trimesh.load(SRC_OBJ, process=False)
    print("raw:", len(m.vertices), "verts,", len(m.faces), "faces")

    bodies = m.split(only_watertight=False)
    kept = [b for b in bodies if len(b.faces) >= 10]
    print(f"bodies: {len(bodies)} total, {len(kept)} kept (>=10 faces), "
          f"{len(bodies) - len(kept)} dropped as debris")
    cleaned = trimesh.util.concatenate(kept)
    cleaned_path = os.path.join(WORK_DIR, "cleaned.stl")
    resampled_path = os.path.join(WORK_DIR, "resampled.stl")
    cleaned.export(cleaned_path)

    ms = pymeshlab.MeshSet()
    ms.load_new_mesh(cleaned_path)
    ms.generate_resampled_uniform_mesh(cellsize=pymeshlab.PercentageValue(CELLSIZE_PCT))
    ms.save_current_mesh(resampled_path)

    resampled = trimesh.load(resampled_path)
    rbodies = sorted(resampled.split(only_watertight=False), key=lambda b: -len(b.faces))
    main_body = rbodies[0]
    print("main body:", len(main_body.faces), "faces, watertight:", main_body.is_watertight,
          f"({len(rbodies) - 1} tiny fragments dropped)")

    # source is Y-up; rotate +90 deg about X so Z becomes up (right-side up)
    main_body.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [1, 0, 0]))
    main_body.apply_translation([0, 0, -main_body.bounds[0][2]])  # ground the feet

    scale = TARGET_HEIGHT_MM / main_body.extents[2]
    main_body.apply_scale(scale)
    main_body.fix_normals()

    print("final: watertight =", main_body.is_watertight, "bounds =", main_body.bounds)
    main_body.export(os.path.join(OUT_STL, "mandoli_figure.stl"))
    print("scale factor used:", scale)


if __name__ == "__main__":
    main()
