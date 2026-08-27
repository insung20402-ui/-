"""
Make a keyring-ready version of the Mandoli figure: scales the printable
STL down to keyring size and fuses on a small loop (torus) at the top of
the head for a keyring split-ring to pass through.
"""
import os

import numpy as np
import trimesh

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SRC_STL = os.path.join(SCRIPT_DIR, "..", "stl", "mandoli_figure.stl")
OUT_STL = os.path.join(SCRIPT_DIR, "..", "stl")

TARGET_HEIGHT_MM = 40.0
LOOP_MAJOR_R = 3.6   # outer loop radius (mm)
LOOP_MINOR_R = 1.4   # loop tube thickness (mm)
LOOP_Y = 1.0          # position over the head, front/back offset
LOOP_Z = 37.5         # position over the head, height (embeds into the crest)


def main():
    m = trimesh.load(SRC_STL)
    scale = TARGET_HEIGHT_MM / m.extents[2]
    m.apply_scale(scale)
    m.apply_translation([0, 0, -m.bounds[0][2]])

    loop = trimesh.creation.torus(major_radius=LOOP_MAJOR_R, minor_radius=LOOP_MINOR_R,
                                   major_sections=48, minor_sections=24)
    loop.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [0, 1, 0]))
    loop.apply_translation([0, LOOP_Y, LOOP_Z])

    fused = m.union(loop, engine="manifold")
    print("watertight:", fused.is_watertight, "bounds:", fused.bounds)

    out_path = os.path.join(OUT_STL, "mandoli_keyring_40mm.stl")
    fused.export(out_path)
    print("saved:", out_path)


if __name__ == "__main__":
    main()
