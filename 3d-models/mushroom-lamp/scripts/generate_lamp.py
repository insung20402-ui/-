"""
Glow Mushroom Lamp - parametric 3D model generator.
Builds a real, manufacturable (3D-printable) lamp inspired by the reference
Tripo Studio turntable video: a bioluminescent mushroom-cluster night lamp
sitting on a stone/moss base.

Two physical parts are produced (meant to be printed separately and then
assembled with an LED module):
  1. shade.stl  - large mushroom cap + stem, hollow shell, translucent resin/PLA,
                   open at the bottom so an LED puck can be dropped in.
  2. base.stl   - stone base plate with a socket boss for the shade, a small
                   solid decorative mushroom, an internal cavity for the LED
                   driver/battery, and a cable/power hole underneath.

All units are millimetres.
"""
import os

import numpy as np
import trimesh
from shapely.geometry import Polygon
from trimesh.creation import revolve

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_STL = os.path.join(SCRIPT_DIR, "..", "stl")
os.makedirs(OUT_STL, exist_ok=True)

SECTIONS = 96  # radial resolution of every lathe-revolved part


def offset_polyline_2d(pts, dist):
    """Offset an open 2D polyline by `dist` along its local inward normal
    (miter join, good enough for smooth mushroom-shaped curves)."""
    pts = np.asarray(pts, dtype=float)
    n = len(pts)
    seg = pts[1:] - pts[:-1]
    seg_len = np.linalg.norm(seg, axis=1, keepdims=True)
    seg_dir = seg / seg_len
    # 2D normal pointing to the "inside" (rotate tangent by -90 deg so that
    # for a curve traced bottom->top with increasing-then-decreasing radius,
    # the normal points toward the revolve axis / interior of the material)
    seg_norm = np.column_stack([seg_dir[:, 1], -seg_dir[:, 0]])

    vert_norms = np.zeros_like(pts)
    vert_norms[0] = seg_norm[0]
    vert_norms[-1] = seg_norm[-1]
    for i in range(1, n - 1):
        avg = seg_norm[i - 1] + seg_norm[i]
        norm = np.linalg.norm(avg)
        vert_norms[i] = avg / norm if norm > 1e-9 else seg_norm[i - 1]
        # miter length correction
        cos_half = np.dot(vert_norms[i], seg_norm[i - 1])
        cos_half = np.clip(cos_half, 0.2, 1.0)
        vert_norms[i] = vert_norms[i] / cos_half

    return pts + vert_norms * dist


def build_shell_profile(outer_pts, wall):
    """Given an open outer profile (bottom -> apex), build the closed 2D
    polygon (outer up, inner back down) for a hollow shell that is OPEN at
    the first point (bottom) and CLOSED at the last point (apex/top)."""
    outer_pts = np.asarray(outer_pts, dtype=float)
    inner_pts = offset_polyline_2d(outer_pts, -wall)[::-1]
    # keep the very apex fully closed (inner apex snaps to r=0)
    inner_pts[0, 0] = 0.0
    # keep the open bottom rim perfectly flat (inner bottom snaps to outer bottom z)
    inner_pts[-1, 1] = outer_pts[0, 1]
    profile = np.vstack([outer_pts, inner_pts])
    # clip any negative radii that can appear from aggressive offsets
    profile[:, 0] = np.clip(profile[:, 0], 0.0, None)
    return profile


def smoothstep(t):
    t = np.clip(t, 0.0, 1.0)
    return t * t * (3 - 2 * t)


def lerp_curve(p0, p1, n):
    t = smoothstep(np.linspace(0, 1, n))
    return [(p0[0] + (p1[0] - p0[0]) * ti, p0[1] + (p1[1] - p0[1]) * ti) for ti in t]


def make_shade(wall=2.6, rim_r=95.0, rim_z=120.0, dome_h=70.0):
    """Large glowing mushroom: bulbous hourglass stem + wide bell cap.
    The cap top is a true quarter-ellipse arc (steep shoulder right at the
    rim, rounding over to a flat-ish crown) so it reads as a bulbous mushroom
    cap rather than a flat cone."""
    stem = (
        lerp_curve((20.0, 0.0), (15.0, 40.0), 5)
        + lerp_curve((15.0, 40.0), (18.0, 80.0), 5)[1:]
        + lerp_curve((18.0, 80.0), (30.0, 98.0), 5)[1:]
    )
    shoulder = lerp_curve((30.0, 98.0), (rim_r * 0.94, rim_z - 3.0), 10)[1:]

    theta = np.linspace(0, np.pi / 2, 26)
    dome = [(rim_r * np.cos(t), rim_z + dome_h * np.sin(t)) for t in theta]

    outer = stem + shoulder + dome
    profile = build_shell_profile(outer, wall)
    mesh = revolve(profile, sections=SECTIONS)
    mesh.merge_vertices()
    mesh.fix_normals()
    return mesh


def make_small_mushroom(scale=0.42, z_offset=0.0):
    """Small secondary decorative mushroom, same silhouette family as the
    shade, scaled down and solid (fused onto the base, no LED needed)."""
    rim_r, rim_z, dome_h = 26.0, 34.0, 20.0
    stem = lerp_curve((9.0, 0.0), (7.0, 14.0), 6) + lerp_curve((7.0, 14.0), (10.0, 26.0), 6)[1:]
    shoulder = lerp_curve((10.0, 26.0), (rim_r * 0.94, rim_z - 1.5), 8)[1:]
    theta = np.linspace(0, np.pi / 2, 16)
    dome = [(rim_r * np.cos(t), rim_z + dome_h * np.sin(t)) for t in theta]
    outer = [(0.0, 0.0)] + stem + shoulder + dome
    outer = [(r * scale, h * scale) for r, h in outer]
    mesh = revolve(np.array(outer), sections=SECTIONS)
    mesh.merge_vertices()
    mesh.fix_normals()
    if z_offset:
        mesh.apply_translation([0, 0, z_offset])
    return mesh


def make_fern_leaf(length=42.0, width=9.0, thickness=1.6, curve=20.0):
    """A single thin, pointed fern-frond blade standing on the XY plane,
    tip at +Z, gently arced sideways (+Y) as it rises."""
    n = 16
    t = np.linspace(0.0, 1.0, n)[1:-1]  # drop the two zero-width endpoints
    half_w = (width / 2.0) * np.clip(4 * t * (1 - t), 0.0, None)
    xs = t * length
    top = [(0.0, 0.0)] + list(zip(xs, half_w)) + [(length, 0.0)]
    bottom = list(zip(xs[::-1], -half_w[::-1]))
    poly = Polygon(top + bottom)

    mesh = trimesh.creation.extrude_polygon(poly, height=thickness)
    mesh.apply_translation([0, 0, -thickness / 2.0])
    # stand the blade up: length axis (was X) becomes +Z
    mesh.apply_transform(trimesh.transformations.rotation_matrix(-np.pi / 2, [0, 1, 0]))

    verts = mesh.vertices.copy()
    zt = np.clip(verts[:, 2] / length, 0.0, 1.0)
    verts[:, 1] += curve * zt ** 1.6  # arch sideways toward the tip
    mesh.vertices = verts
    mesh.fix_normals()
    return mesh


def make_fern_clump(n_leaves=6, base_length=40.0, spread_deg=130.0, seed=0):
    """A small fan of fern leaves sprouting from one point, like the ferns
    tucked around the mushrooms in the reference video."""
    rng = np.random.default_rng(seed)
    angles = np.linspace(-spread_deg / 2.0, spread_deg / 2.0, n_leaves)
    leaves = []
    for ang in angles:
        frac = 1.0 - 0.30 * (abs(ang) / (spread_deg / 2.0))
        length = base_length * frac * rng.uniform(0.9, 1.08)
        width = 8.5 * frac
        curve = 16.0 + 8.0 * rng.uniform(0.0, 1.0)
        leaf = make_fern_leaf(length=length, width=width, thickness=1.6, curve=curve)
        leaf.apply_transform(trimesh.transformations.rotation_matrix(np.radians(ang), [0, 0, 1]))
        leaves.append(leaf)
    return trimesh.util.concatenate(leaves)


def make_base(radius=105.0, height=26.0, flat_r=58.0,
              socket_r=20.6, socket_depth=18.0,
              cavity_r=42.0, floor_thickness=3.5,
              cable_hole_r=4.0):
    """Rounded river-stone base plate.
    - flat underside (radius `flat_r`) so it sits on a table
    - gently domed / rounded top and edge (organic stone look)
    - socket boss on top that the shade's stem plugs into (friction fit)
    - internal cavity accessed from underneath for the LED driver / battery,
      surrounded by a solid `flat_r - cavity_r` wide standing rim so the
      base still sits flat and rigid on the table
    - small cable-exit hole through the standing rim
    """
    top_r = radius            # widest point of the pebble, at socket_z
    socket_z = height * 0.62  # top surface height where the boss sits
    apex_z = height * 1.04

    outer = [
        (0.0, 0.0),
        (flat_r, 0.0),
        (radius * 0.92, socket_z * 0.55),
        (top_r, socket_z),
        (radius * 0.90, socket_z + (apex_z - socket_z) * 0.45),
        (radius * 0.55, apex_z * 0.97),
        (0.0, apex_z),
    ]
    stone = revolve(np.array(outer), sections=SECTIONS)
    stone.merge_vertices()

    # socket boss (raised ring the shade's stem friction-fits into)
    boss_h = 10.0
    boss = trimesh.creation.annulus(r_min=socket_r + 0.35, r_max=socket_r + 3.8,
                                     height=boss_h, sections=SECTIONS)
    boss.apply_translation([0, 0, socket_z + boss_h / 2.0])
    stone = stone.union(boss, engine="manifold")

    # socket hole (the shade stem's 20mm-radius foot drops in here)
    socket_h = socket_depth + boss_h
    socket_cutter = trimesh.creation.cylinder(radius=socket_r, height=socket_h * 2,
                                               sections=SECTIONS)
    socket_cutter.apply_translation([0, 0, socket_z + boss_h - socket_h])
    stone = stone.difference(socket_cutter, engine="manifold")

    # internal cavity for LED driver / coin-cell or USB module, opening
    # from underneath; a `floor_thickness` slab is left above z=0 and a
    # solid rim (cavity_r -> flat_r) is left so the base still stands flat
    cavity = trimesh.creation.cylinder(radius=cavity_r, height=200.0,
                                        sections=SECTIONS)
    cavity.apply_translation([0, 0, floor_thickness - 100.0])
    stone = stone.difference(cavity, engine="manifold")

    # cable-exit hole through the standing rim (between cavity and edge)
    cable = trimesh.creation.cylinder(radius=cable_hole_r, height=60.0, sections=32)
    cable.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [1, 0, 0]))
    cable.apply_translation([(cavity_r + flat_r) / 2.0, 0, floor_thickness / 2.0])
    stone = stone.difference(cable, engine="manifold")

    # small secondary mushroom fused onto the stone, off to one side
    small = make_small_mushroom(scale=0.6)
    small_pos = np.array([-radius * 0.68, radius * 0.35, socket_z * 0.45])
    small.apply_translation(small_pos)
    stone = stone.union(small, engine="manifold")

    # ferns wrapped most of the way around the stem, matching the reference
    # sculpt's full fern coverage (not just a couple of accents)
    fern_ring = [
        # (angle_deg, radius, z_frac, scale, n_leaves)
        (10.0, 60.0, 0.55, 1.15, 8),
        (55.0, 66.0, 0.30, 0.70, 6),
        (95.0, 62.0, 0.45, 0.90, 7),
        (150.0, 57.0, 0.40, 0.95, 7),   # flanks the small mushroom
        (185.0, 63.0, 0.60, 0.65, 5),
        (230.0, 60.0, 0.35, 1.00, 8),
        (275.0, 65.0, 0.55, 0.75, 6),
        (320.0, 58.0, 0.45, 1.05, 8),
    ]
    ferns = []
    for i, (angle_deg, fr, z_frac, scale, n_leaves) in enumerate(fern_ring):
        ang = np.radians(angle_deg)
        x, y = fr * np.cos(ang), fr * np.sin(ang)
        z = socket_z * z_frac
        rot = angle_deg - 90.0  # fan opens radially outward from the stem
        fern = make_fern_clump(n_leaves=n_leaves, base_length=40.0 * scale, seed=i + 1)
        fern.apply_transform(trimesh.transformations.rotation_matrix(np.radians(rot), [0, 0, 1]))
        fern.apply_translation([x, y, z])
        ferns.append(fern)
    all_ferns = trimesh.util.concatenate(ferns)
    stone = stone.union(all_ferns, engine="manifold")

    stone.fix_normals()
    return stone


def main():
    shade = make_shade()
    shade.apply_translation([0, 0, 0])  # stem bottom sits at z=0 (base socket bottom)

    base = make_base()

    shade.export(f"{OUT_STL}/shade.stl")
    base.export(f"{OUT_STL}/base.stl")

    print("shade watertight:", shade.is_watertight, "volume(mm3):", shade.volume)
    print("base watertight:", base.is_watertight, "volume(mm3):", base.volume)
    print("shade bounds:", shade.bounds)
    print("base bounds:", base.bounds)

    # assembly preview (visual only - shade seated on the base socket boss)
    socket_z = 26.0 * 0.62
    boss_h = 10.0
    shade_preview = shade.copy()
    shade_preview.apply_translation([0, 0, socket_z + boss_h - 10.0])
    scene = trimesh.Scene([base, shade_preview])
    scene.export(f"{OUT_STL}/assembly_preview.glb")

    return shade, base, shade_preview


if __name__ == "__main__":
    main()
