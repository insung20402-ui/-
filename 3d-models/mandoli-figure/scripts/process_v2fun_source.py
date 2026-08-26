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
6. Cut the tail feathers (bounding-box face removal) and reseal the surface
   by re-running the uniform resample + PyMeshLab hole closing.
7. Paint approximate flat vertex colors (no source texture was provided --
   only material.mtl referencing a PNG that was never supplied) matching
   the colour reference photos, exported as a separate colour GLB. The
   plain STL stays uncoloured (STL cannot carry colour).
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

# bounding box (final mm-space) that isolates just the tail feathers
TAIL_BOX = dict(x=(0, 60), y=(15, 65), z=(25, 100))


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

    print("after reorient/scale: watertight =", main_body.is_watertight,
          "bounds =", main_body.bounds)

    no_tail = remove_tail(main_body)
    print("tail removed: watertight =", no_tail.is_watertight)

    no_tail.export(os.path.join(OUT_STL, "mandoli_figure.stl"))
    colorize(no_tail)
    print("scale factor used:", scale)


def remove_tail(mesh):
    """Cut faces inside TAIL_BOX, then reseal the resulting hole by
    re-running the uniform resample (fills gaps left by removed geometry)
    followed by PyMeshLab's explicit hole-closing filter for any residual
    small openings the resample doesn't bridge."""
    fc = mesh.triangles_center
    xb, yb, zb = TAIL_BOX["x"], TAIL_BOX["y"], TAIL_BOX["z"]
    tail_mask = ((fc[:, 0] > xb[0]) & (fc[:, 0] < xb[1]) &
                 (fc[:, 1] > yb[0]) & (fc[:, 1] < yb[1]) &
                 (fc[:, 2] > zb[0]) & (fc[:, 2] < zb[1]))
    cut = mesh.submesh([~tail_mask], append=True)
    cut_path = os.path.join(WORK_DIR, "cut_notail.stl")
    resealed_path = os.path.join(WORK_DIR, "resealed_notail.stl")
    cut.export(cut_path)

    ms = pymeshlab.MeshSet()
    ms.load_new_mesh(cut_path)
    ms.generate_resampled_uniform_mesh(cellsize=pymeshlab.PercentageValue(CELLSIZE_PCT))
    ms.meshing_close_holes(maxholesize=2000)  # shrinks the tail gap most of the way
    ms.save_current_mesh(resealed_path)

    # isolate the main body (drop debris), then close what's left of the
    # gap in a second pass -- doing this only after dropping debris is what
    # actually finishes sealing it
    resealed = trimesh.load(resealed_path)
    bodies = sorted(resealed.split(only_watertight=False), key=lambda b: -len(b.faces))
    main_only_path = os.path.join(WORK_DIR, "main_only.stl")
    bodies[0].export(main_only_path)

    ms2 = pymeshlab.MeshSet()
    ms2.load_new_mesh(main_only_path)
    ms2.meshing_close_holes(maxholesize=100)
    closed_path = os.path.join(WORK_DIR, "main_closed.stl")
    ms2.save_current_mesh(closed_path)

    main_body = trimesh.load(closed_path)
    main_body.fill_holes()  # closes any last tiny gap the filter above missed
    main_body.fix_normals()
    main_body.apply_translation([0, 0, -main_body.bounds[0][2]])
    return main_body


def colorize(mesh):
    """Paint approximate flat vertex colours matching the reference photos
    (no original texture was available). Region boundaries are simple
    position heuristics tuned by eye against renders -- not exact."""
    v = mesh.vertices
    x, y, z = v[:, 0], v[:, 1], v[:, 2]
    ax = np.abs(x)

    WHITE, NAVY = np.array([245, 243, 238]), np.array([26, 33, 58])
    BLUE_DARK, BLUE_LIGHT = np.array([28, 70, 160]), np.array([120, 180, 235])
    YELLOW, SOLE_DARK = np.array([245, 190, 40]), np.array([40, 45, 70])

    colors = np.tile(WHITE, (len(v), 1)).astype(float)

    colors[(z >= 63) & (z <= 165) & (ax <= 47)] = NAVY               # vest
    colors[(z >= 145) & (z <= 172) & (ax > 38) & (ax <= 62)] = WHITE  # shoulder poofs

    arm_mask = (z >= 63) & (z <= 165) & (ax > 47)                     # arms/wings
    t = np.clip((ax[arm_mask] - 47) / (101 - 47), 0, 1)
    colors[arm_mask] = BLUE_DARK[None, :] * (1 - t[:, None]) + BLUE_LIGHT[None, :] * t[:, None]

    colors[(z >= 33) & (z < 63)] = NAVY                               # shorts

    shoe_mask = z < 14
    colors[shoe_mask] = WHITE
    colors[shoe_mask & (ax > 18)] = YELLOW                            # shoe outer
    colors[z < 4] = SOLE_DARK                                         # sole

    colors[z >= 210] = BLUE_DARK                                      # crest tips
    colors[(z >= 178) & (z <= 202) & (y > 44) & (ax < 20)] = YELLOW   # beak

    rgba = np.concatenate([colors, np.full((len(v), 1), 255)], axis=1).astype(np.uint8)
    mesh.visual.vertex_colors = rgba
    mesh.export(os.path.join(OUT_STL, "mandoli_figure_colored.glb"))


if __name__ == "__main__":
    main()
