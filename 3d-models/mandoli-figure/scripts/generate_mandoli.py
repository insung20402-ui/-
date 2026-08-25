"""
Mandoli (만돌이) mascot figure - parametric 3D model generator.
A chibi eagle/falcon school-mascot figure (round head, spiky feather
crest, big cartoon eyes, sweater vest with shield emblem, wing-hands,
shorts, sneakers, tail feathers), built from primitives + swept blade
shapes and unioned into a single printable STL.

Units: millimetres. Standing pose, feet on the ground plane z=0.
"""
import os

import numpy as np
import trimesh
from shapely.geometry import Polygon

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_STL = os.path.join(SCRIPT_DIR, "..", "stl")
os.makedirs(OUT_STL, exist_ok=True)

TARGET_HEIGHT_MM = 220.0  # finished figure height ("좀 크게")

SECTIONS = 48


def cap(radius, height, sections=SECTIONS):
    return trimesh.creation.capsule(radius=radius, height=height, count=[sections, sections // 2])


def limb_segment(length, radius, radius2=None):
    """An elongated blob (ellipsoid) of total span `length` along +Z,
    centred at the origin -- easier to reason about than a capsule when
    the radius is a large fraction of the segment length (chibi limbs)."""
    radius2 = radius if radius2 is None else radius2
    s = sphere(1.0, subdiv=3)
    s.apply_scale([radius, radius, length / 2.0])
    return s


def sphere(radius, subdiv=3):
    return trimesh.creation.icosphere(subdivisions=subdiv, radius=radius)


def blade(length, width, thickness, curve=0.0, n=14):
    """Same tapered-leaf/feather blade technique as the fern generator:
    pointed both ends, standing along +Z, arching sideways (+Y) with height."""
    t = np.linspace(0.0, 1.0, n)[1:-1]
    half_w = (width / 2.0) * np.clip(4 * t * (1 - t), 0.0, None)
    xs = t * length
    top = [(0.0, 0.0)] + list(zip(xs, half_w)) + [(length, 0.0)]
    bottom = list(zip(xs[::-1], -half_w[::-1]))
    poly = Polygon(top + bottom)
    mesh = trimesh.creation.extrude_polygon(poly, height=thickness)
    mesh.apply_translation([0, 0, -thickness / 2.0])
    mesh.apply_transform(trimesh.transformations.rotation_matrix(-np.pi / 2, [0, 1, 0]))
    if curve:
        verts = mesh.vertices.copy()
        zt = np.clip(verts[:, 2] / length, 0.0, 1.0)
        verts[:, 1] += curve * zt ** 1.5
        mesh.vertices = verts
    mesh.fix_normals()
    return mesh


def feather_fan(n=5, length=38.0, width=10.0, thickness=2.2, spread_deg=100.0, curve=10.0, seed=0):
    rng = np.random.default_rng(seed)
    angles = np.linspace(-spread_deg / 2, spread_deg / 2, n)
    parts = []
    for ang in angles:
        frac = 1.0 - 0.25 * abs(ang) / (spread_deg / 2)
        L = length * frac * rng.uniform(0.92, 1.05)
        f = blade(L, width * frac, thickness, curve=curve)
        f.apply_transform(trimesh.transformations.rotation_matrix(np.radians(ang), [0, 0, 1]))
        parts.append(f)
    return trimesh.util.concatenate(parts)


def R(axis, deg):
    return trimesh.transformations.rotation_matrix(np.radians(deg), axis)


def T(mesh, xyz):
    mesh = mesh.copy()
    mesh.apply_translation(xyz)
    return mesh


def rot(mesh, axis, deg, about=(0, 0, 0)):
    mesh = mesh.copy()
    m = R(axis, deg)
    mesh.apply_transform(trimesh.transformations.translation_matrix([-a for a in about]))
    mesh.apply_transform(m)
    mesh.apply_transform(trimesh.transformations.translation_matrix(about))
    return mesh


def scale(mesh, sxyz):
    mesh = mesh.copy()
    mesh.apply_scale(sxyz)
    return mesh


def align_z_to(mesh, direction):
    direction = np.array(direction, dtype=float)
    direction /= np.linalg.norm(direction)
    Rm = trimesh.geometry.align_vectors([0.0, 0.0, 1.0], direction)
    mesh = mesh.copy()
    mesh.apply_transform(Rm)
    return mesh


def make_arm(upper_len=40, upper_r=16, fore_len=38, fore_r=13,
             upper_dir=(0, 0.15, -1.0), fore_dir=(0, 0.15, -1.0),
             hand_len=34.0, hand_w=12.0, fan_seed=0):
    """Shoulder at the origin; upper arm along `upper_dir`, forearm from the
    elbow along `fore_dir`, feather-fan hand at the wrist."""
    ud = np.array(upper_dir, dtype=float)
    ud /= np.linalg.norm(ud)
    fd = np.array(fore_dir, dtype=float)
    fd /= np.linalg.norm(fd)

    parts = []
    upper = limb_segment(upper_len, upper_r)
    upper = align_z_to(upper, ud)
    upper.apply_translation(ud * upper_len / 2.0)
    parts.append(upper)
    elbow = ud * upper_len

    overlap = min(upper_r, fore_r) * 0.7
    elbow_j = elbow - fd * overlap
    fore = limb_segment(fore_len, fore_r)
    fore = align_z_to(fore, fd)
    fore.apply_translation(fd * fore_len / 2.0 + elbow_j)
    parts.append(fore)

    hand_pos = elbow_j + fd * fore_len
    hand = feather_fan(n=5, length=hand_len, width=hand_w, thickness=2.4,
                        spread_deg=110, curve=8.0, seed=fan_seed)
    hand = align_z_to(hand, fd)
    hand.apply_translation(hand_pos - fd * fore_r * 0.5)
    parts.append(hand)

    return trimesh.util.concatenate(parts), hand_pos


def make_leg(thigh_len=30, thigh_r=19, shin_len=34, shin_r=15,
             shoe_len=46, shoe_h=23, shoe_w=29):
    """Thigh/shin segments overlap generously at the joint so the union
    reads as one soft stocky leg rather than a string of beads."""
    parts = []
    thigh = limb_segment(thigh_len, thigh_r)
    thigh.apply_translation([0, 0, -thigh_len / 2.0])
    parts.append(thigh)

    overlap1 = min(thigh_r, shin_r) * 0.7
    z1 = -thigh_len + overlap1
    shin = limb_segment(shin_len, shin_r)
    shin.apply_translation([0, 0, z1 - shin_len / 2.0])
    parts.append(shin)
    z2 = z1 - shin_len

    # sneaker: a squashed rounded blob + flat sole, overlapping the shin
    overlap2 = shin_r * 0.7
    shoe_z = z2 + overlap2
    shoe = sphere(1.0, subdiv=3)
    shoe.apply_scale([shoe_w / 2.0, shoe_len / 2.0, shoe_h / 2.0])
    shoe.apply_translation([0, shoe_len * 0.18, shoe_z - shoe_h * 0.42])
    parts.append(shoe)

    sole = trimesh.creation.box(extents=[shoe_w * 0.95, shoe_len * 0.98, shoe_h * 0.22])
    sole.apply_translation([0, shoe_len * 0.18, shoe_z - shoe_h * 0.78])
    parts.append(sole)

    return trimesh.util.concatenate(parts)


def wedge_cone(length, width, thick, tip_droop_deg=0.0):
    """A cone flattened into a beak/spike wedge, base at the origin,
    pointing along +Y (base circle lies in the local XZ plane)."""
    c = trimesh.creation.cone(radius=1.0, height=length, sections=20)
    c.apply_scale([width / 2.0, thick / 2.0, 1.0])
    c = rot(c, [1, 0, 0], -90)  # tip +Z -> +Y
    if tip_droop_deg:
        c = rot(c, [1, 0, 0], -tip_droop_deg)
    return c


def make_head(radius=52.0):
    parts = []
    head = sphere(radius, subdiv=4)
    head = scale(head, [1.0, 0.92, 1.05])
    parts.append(head)

    # beak: open, in two parts (upper/lower) with a visible gap between them,
    # matching the reference's open, smiling beak
    beak_up = wedge_cone(length=28.0, width=30.0, thick=13.0, tip_droop_deg=8.0)
    beak_up.apply_translation([0, radius * 0.86, radius * 0.015])
    parts.append(beak_up)
    beak_lo = wedge_cone(length=24.0, width=27.0, thick=11.0, tip_droop_deg=30.0)
    beak_lo.apply_translation([0, radius * 0.86, -radius * 0.075])
    parts.append(beak_lo)

    # eyes: raised domes with pupils sitting flush on their front surface
    eye_r = 15.0
    for side in (-1, 1):
        ex, ey, ez = side * radius * 0.40, radius * 0.74, radius * 0.14
        eye = sphere(eye_r, subdiv=3)
        eye = scale(eye, [1.0, 0.75, 1.0])
        eye.apply_translation([ex, ey, ez])
        parts.append(eye)
        pupil = sphere(6.5, subdiv=2)
        pupil.apply_translation([ex, ey + eye_r * 0.62, ez])
        parts.append(pupil)

    # brow ridges: bold raised arcs above each eye
    for side in (-1, 1):
        brow = blade(30, 10, 6.5, curve=10)
        brow = rot(brow, [1, 0, 0], 96)
        brow = rot(brow, [0, 0, 1], side * 20)
        brow.apply_translation([side * radius * 0.40, radius * 0.72, radius * 0.36])
        parts.append(brow)

    # head crest: two big spiky feather tufts (matching the reference's twin
    # spikes) plus one small centre spike
    crest_specs = [(-24, 1.0), (24, 1.0), (0, 0.6)]
    for ang, s in crest_specs:
        tuft = wedge_cone(length=46 * s, width=17 * s, thick=11 * s)
        tuft = rot(tuft, [1, 0, 0], 70)
        tuft = rot(tuft, [0, 0, 1], ang)
        tuft.apply_translation([0, -radius * 0.08, radius * 0.92])
        parts.append(tuft)

    # fluffy cascading feather ruff/mane covering most of the head, in several
    # overlapping rings (crown -> down over the cheeks/back of the neck),
    # matching the layered "mophead" fluff in the colour reference photos
    ring_specs = [
        # (z_frac, tilt_from_horizontal_deg, length, width, n_blades, skip_front_deg)
        (0.62, 15, 30, 15, 18, 78),
        (0.30, 45, 42, 17, 18, 82),
        (0.00, 75, 50, 19, 18, 88),
        (-0.30, 100, 48, 18, 16, 100),
        (-0.55, 120, 40, 16, 14, 112),
    ]
    for z_frac, tilt, length, width, n_blades, skip_deg in ring_specs:
        for i in range(n_blades):
            a = 360.0 * i / n_blades
            da = min(a, 360.0 - a)
            if da < skip_deg:
                continue
            f = blade(length, width, 4.2, curve=length * 0.12)
            f = rot(f, [1, 0, 0], 90 + tilt)
            f = rot(f, [0, 0, 1], -a)
            pos = np.array([np.sin(np.radians(a)), np.cos(np.radians(a)), 0]) * radius * 0.92
            pos[2] = radius * z_frac
            f.apply_translation(pos)
            parts.append(f)

    return trimesh.util.concatenate(parts)


def make_tail(n=6):
    parts = []
    for i in range(n):
        ang = -60 + i * 24
        L = 46 - abs(i - n / 2) * 4
        f = blade(L, 13, 3, curve=14)
        f = rot(f, [1, 0, 0], 165)
        f = rot(f, [0, 0, 1], ang)
        parts.append(f)
    return trimesh.util.concatenate(parts)


def build(scale_factor=1.0):
    parts = []

    torso_h = 50.0
    torso = cap(42.0, torso_h)
    torso = scale(torso, [1.08, 0.98, 1.0])
    torso.apply_translation([0, 0, torso_h / 2.0])
    parts.append(torso)

    # shield emblem on the chest
    shield = trimesh.creation.extrude_polygon(
        Polygon([(-9, 0), (9, 0), (9, 10), (0, 18), (-9, 10)]), height=3.0)
    shield.apply_translation([-1.5, 0, -1.5])
    shield = rot(shield, [1, 0, 0], 90)
    shield.apply_translation([20, 42.0, torso_h * 0.58])
    parts.append(shield)

    # collar tie, hanging from the neckline
    tie = blade(30, 9, 2.5, curve=0)
    tie = rot(tie, [1, 0, 0], 180)
    tie.apply_translation([0, 43.0, torso_h * 0.96])
    parts.append(tie)

    torso_top = torso_h

    head = make_head(62.0)
    head.apply_translation([0, 2.0, torso_top + 44.0])
    parts.append(head)

    shorts_h = 26.0
    shorts = cap(44.0, shorts_h)
    shorts.apply_translation([0, 0, -shorts_h / 2.0])
    parts.append(shorts)

    leg_l = make_leg()
    leg_l.apply_translation([-21, 0, -shorts_h * 0.75])
    parts.append(leg_l)
    leg_r = make_leg()
    leg_r.apply_translation([21, 0, -shorts_h * 0.75])
    parts.append(leg_r)

    shoulder_z = torso_top * 0.92

    # puffy round shoulder pauldrons (white sleeve caps in the reference)
    for side in (-1, 1):
        poof = sphere(18.0, subdiv=3)
        poof = scale(poof, [1.0, 0.9, 0.85])
        poof.apply_translation([side * 40.0, 2.0, shoulder_z + 4.0])
        parts.append(poof)

    # left arm: relaxed, hanging at the side
    arm_l, _ = make_arm(upper_dir=(-0.30, 0.10, -0.95), fore_dir=(-0.20, 0.20, -0.96),
                         fan_seed=1)
    arm_l.apply_translation([-46, 0, shoulder_z])
    parts.append(arm_l)

    # right arm: raised, fist/wing held up beside the face
    arm_r, _ = make_arm(upper_dir=(0.35, 0.15, 0.85), fore_dir=(-0.55, 0.30, 0.78),
                         hand_len=30.0, hand_w=13.0, fan_seed=2)
    arm_r.apply_translation([44, 2, shoulder_z])
    parts.append(arm_r)

    tail = make_tail()
    tail.apply_translation([0, -32, -shorts_h * 0.55])
    parts.append(tail)

    figure = trimesh.util.concatenate(parts)
    figure.apply_translation([0, 0, -figure.bounds[0][2]])  # ground the feet at z=0
    if scale_factor != 1.0:
        figure.apply_scale(scale_factor)
    figure.fix_normals()
    return figure


if __name__ == "__main__":
    raw = build()
    raw_h = raw.bounds[1][2] - raw.bounds[0][2]
    fig = build(scale_factor=TARGET_HEIGHT_MM / raw_h)
    print("watertight:", fig.is_watertight, "bodies:", fig.body_count)
    print("bounds:", fig.bounds)
    print("height (mm):", fig.bounds[1][2] - fig.bounds[0][2])
    fig.export(f"{OUT_STL}/mandoli_figure.stl")
