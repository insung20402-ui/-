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
from shapely.geometry import Point, Polygon
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


def make_fern_frond(length=42.0, n_pairs=7, leaflet_len=11.0, thickness=1.4, curve=18.0):
    """A real pinnate fern frond: a thin curved rachis (central stalk) with
    small tapered leaflets branching off in mirrored pairs, matching the
    feathery fern fronds in the reference sculpt (not a single solid blade)."""
    rachis = make_fern_leaf(length=length, width=2.0, thickness=thickness, curve=curve)
    parts = [rachis]

    ts = np.linspace(0.14, 0.96, n_pairs)
    for t in ts:
        size = np.sin(np.pi * np.clip((t - 0.04) / 0.96, 0.0, 1.0)) ** 0.7
        llen = leaflet_len * (0.30 + 0.70 * size)
        z = t * length
        y = curve * t ** 1.6
        elev_deg = 85.0 - 45.0 * t  # near-horizontal at the base, upright near the tip

        for side in (-1.0, 1.0):
            leaflet = make_fern_leaf(length=llen, width=llen * 0.30,
                                      thickness=thickness * 0.85, curve=llen * 0.22)
            # tip points +Z by default -> tip out to the side, tilted per `elev_deg`
            leaflet.apply_transform(
                trimesh.transformations.rotation_matrix(side * np.radians(elev_deg), [0, 1, 0])
            )
            leaflet.apply_translation([0, y, z])
            parts.append(leaflet)

    return trimesh.util.concatenate(parts)


def make_fern_clump(n_leaves=6, base_length=40.0, spread_deg=130.0, seed=0):
    """A small fan of pinnate fern fronds sprouting from one point, like the
    ferns tucked around the mushrooms in the reference sculpt."""
    rng = np.random.default_rng(seed)
    angles = np.linspace(-spread_deg / 2.0, spread_deg / 2.0, n_leaves)
    fronds = []
    for ang in angles:
        frac = 1.0 - 0.30 * (abs(ang) / (spread_deg / 2.0))
        length = base_length * frac * rng.uniform(0.9, 1.08)
        curve = 16.0 + 8.0 * rng.uniform(0.0, 1.0)
        n_pairs = int(round(5 + 3 * frac))
        frond = make_fern_frond(length=length, n_pairs=n_pairs,
                                 leaflet_len=length * 0.24, curve=curve)
        frond.apply_transform(trimesh.transformations.rotation_matrix(np.radians(ang), [0, 0, 1]))
        fronds.append(frond)
    return trimesh.util.concatenate(fronds)


def make_curl(turns=2.3, r0=9.0, tip_r=0.6, rise=14.0, thickness=1.3, n_pts=60):
    """A curling fiddlehead/snail-shell tendril (as seen coiled around the
    stem base in the reference sculpt): a spiral path swept with a small
    round cross-section, base thick end at the origin."""
    theta = np.linspace(0.0, turns * 2 * np.pi, n_pts)
    k = np.log(r0 / tip_r) / theta[-1]
    r = r0 * np.exp(-k * theta)
    x = r * np.cos(theta)
    z = r * np.sin(theta) + rise * (theta / theta[-1])
    y = np.zeros_like(theta)
    path = np.column_stack([x, y, z])
    path -= path[0]
    poly = Point(0, 0).buffer(thickness / 2.0, resolution=6)
    mesh = trimesh.creation.sweep_polygon(poly, path)
    mesh.fix_normals()
    return mesh


def make_pin(rod_len=16.0, rod_r=0.9, ball_r=2.1):
    """A thin rod topped with a small glowing sphere (the little
    bioluminescent light-stick accents dotted around the reference base)."""
    rod = trimesh.creation.cylinder(radius=rod_r, height=rod_len, sections=16)
    rod.apply_translation([0, 0, rod_len / 2.0])
    ball = trimesh.creation.icosphere(subdivisions=2, radius=ball_r)
    ball.apply_translation([0, 0, rod_len])
    return trimesh.util.concatenate([rod, ball])


def make_moss_bumps(count, r_min, r_max, surface_h, seed=0,
                     bump_r=(1.6, 4.2), avoid=()):
    """Scatter small flattened pebble/moss bumps over an annular region of
    the ground, following the base's own surface height so they sit flush
    (not floating or buried)."""
    rng = np.random.default_rng(seed)
    bumps = []
    tries = 0
    placed = 0
    while placed < count and tries < count * 8:
        tries += 1
        rad = np.sqrt(rng.uniform(r_min ** 2, r_max ** 2))
        ang = rng.uniform(0, 2 * np.pi)
        x, y = rad * np.cos(ang), rad * np.sin(ang)
        if any(np.hypot(x - ax, y - ay) < ar for ax, ay, ar in avoid):
            continue
        rr = rng.uniform(*bump_r)
        zscale = rng.uniform(0.45, 0.7)
        bump = trimesh.creation.icosphere(subdivisions=0, radius=rr)
        bump.apply_scale([1.0, 1.0, zscale])  # squashed pebble
        half_h = rr * zscale
        z = surface_h(x, y) - rr * 0.35
        if z - half_h < 0.3:  # never let the bump's underside poke below the table plane
            z = half_h + 0.3
        bump.apply_translation([x, y, z])
        bumps.append(bump)
        placed += 1
    return trimesh.util.concatenate(bumps)


def make_organic_stone(radius, height, flat_r, seed=3, n_theta=200, n_z=60):
    """A layered, jagged rock-slab silhouette (like the reference sculpt's
    chipped sedimentary-rock base) instead of a plain circle of revolution.

    Same overall nominal profile as a plain axisymmetric pebble (flat
    underside, rounded/domed top), but the radius at every height is
    additionally scaled by:
      - a gentle low-frequency "blob" wobble (organic, non-circular outline)
      - a stronger high-frequency jitter that is banded in Z (each band gets
        its own random phase/offset -> reads as stacked, irregular rock
        layers), faded out near the centre/apex so the top where the
        mushrooms and moss sit stays smooth.
    """
    top_r = radius
    socket_z = height * 0.62
    apex_z = height * 1.04

    ctrl = np.array([
        (0.0, 0.0),
        (flat_r, 0.0),
        (radius * 0.92, socket_z * 0.55),
        (top_r, socket_z),
        (radius * 0.90, socket_z + (apex_z - socket_z) * 0.45),
        (radius * 0.55, apex_z * 0.97),
        (0.0, apex_z),
    ])
    seg_len = np.linalg.norm(np.diff(ctrl, axis=0), axis=1)
    cum = np.concatenate([[0.0], np.cumsum(seg_len)])
    cum /= cum[-1]
    t = np.linspace(0.0, 1.0, n_z)
    r_nom = np.interp(t, cum, ctrl[:, 0])
    z_nom = np.interp(t, cum, ctrl[:, 1])

    theta = np.linspace(0.0, 2 * np.pi, n_theta, endpoint=False)
    rng = np.random.default_rng(seed)

    def fractal_noise(rng, n_harm, k_range, total_amp):
        """Sum of many random-frequency/phase harmonics, decaying with k, so
        the outline reads as organic/irregular rather than a repeating
        flower/gear shape."""
        ks = rng.integers(k_range[0], k_range[1], n_harm)
        phases = rng.uniform(0, 2 * np.pi, n_harm)
        weights = 1.0 / ks ** 0.8
        weights = weights / weights.sum() * total_amp
        s = np.zeros_like(theta)
        for k, ph, w in zip(ks, phases, weights):
            s = s + w * np.cos(k * theta + ph)
        return s

    # gentle organic blob outline (applies at every height) -- many random
    # low/mid harmonics, small total amplitude, so it wobbles rather than
    # forms a clean repeating star
    blob = 1.0 + fractal_noise(rng, n_harm=9, k_range=(2, 9), total_amp=0.045)

    # jagged, banded "rock strata" jitter: a handful of discrete z-bands,
    # each with its own random wobble + a step offset, so consecutive
    # layers don't line up (visible chipped ledges) without looking like a
    # uniform gear
    n_bands = 6
    band_of = np.clip((t * n_bands).astype(int), 0, n_bands - 1)
    band_jitter = np.zeros((n_bands, n_theta))
    band_step = rng.uniform(-0.035, 0.035, n_bands)
    for b in range(n_bands):
        j = fractal_noise(rng, n_harm=8, k_range=(6, 22), total_amp=0.06)
        band_jitter[b] = j + band_step[b]

    # jaggedness fades out toward the centre/apex (r_nom small) so the area
    # under the mushrooms and moss stays smooth; strongest on the outer rim
    edge_amount = np.clip((r_nom - flat_r * 0.35) / (top_r - flat_r * 0.35), 0.0, 1.0) ** 0.6

    verts = np.empty((n_z, n_theta, 3))
    for iz in range(n_z):
        scale = blob * (1.0 + edge_amount[iz] * band_jitter[band_of[iz]])
        r = r_nom[iz] * scale
        verts[iz, :, 0] = r * np.cos(theta)
        verts[iz, :, 1] = r * np.sin(theta)
        verts[iz, :, 2] = z_nom[iz]

    v = verts.reshape(-1, 3)
    faces = []
    for iz in range(n_z - 1):
        row0 = iz * n_theta
        row1 = (iz + 1) * n_theta
        for it in range(n_theta):
            it2 = (it + 1) % n_theta
            a, b, c, d = row0 + it, row0 + it2, row1 + it2, row1 + it
            faces.append((a, b, c))
            faces.append((a, c, d))

    mesh = trimesh.Trimesh(vertices=v, faces=np.array(faces), process=False)
    mesh.merge_vertices()
    mesh.update_faces(mesh.nondegenerate_faces())
    mesh.fix_normals()
    return mesh


def make_base(radius=105.0, height=26.0, flat_r=58.0,
              socket_r=20.6, socket_depth=18.0,
              cavity_r=42.0, floor_thickness=3.5,
              cable_hole_r=4.0):
    """Jagged layered-rock base plate.
    - flat-ish underside (radius `flat_r`) so it sits on a table
    - domed top with an organic, chipped-rock outline (not a perfect circle)
    - socket boss on top that the shade's stem plugs into (friction fit)
    - internal cavity accessed from underneath for the LED driver / battery,
      surrounded by a solid `flat_r - cavity_r` wide standing rim so the
      base still sits flat and rigid on the table
    - small cable-exit hole through the standing rim
    """
    socket_z = height * 0.62  # top surface height where the boss sits
    apex_z = height * 1.04

    stone = make_organic_stone(radius, height, flat_r)

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

    # The stone's top is a dome (highest at the centre, ~apex_z, sloping
    # down to socket_z at the rim) -- NOT a flat plateau. Query the actual
    # mesh via a downward raycast so every decoration sits flush on the
    # real surface instead of an approximated height.
    def surface_z(x, y):
        origin = np.array([[x, y, apex_z + 100.0]])
        direction = np.array([[0.0, 0.0, -1.0]])
        locs, _, _ = stone.ray.intersects_location(origin, direction)
        return float(locs[:, 2].max()) if len(locs) else socket_z

    # small secondary mushroom fused onto the stone, off to one side
    small = make_small_mushroom(scale=0.6)
    sx, sy = -radius * 0.68, radius * 0.35
    small_pos = np.array([sx, sy, surface_z(sx, sy) - 8.0])
    small.apply_translation(small_pos)
    stone = stone.union(small, engine="manifold")

    # ferns wrapped most of the way around the stem, matching the reference
    # sculpt's full fern coverage (not just a couple of accents)
    fern_ring = [
        # (angle_deg, radius, scale, n_leaves)
        (10.0, 60.0, 1.15, 8),
        (55.0, 66.0, 0.70, 6),
        (95.0, 62.0, 0.90, 7),
        (150.0, 57.0, 0.95, 7),   # flanks the small mushroom
        (185.0, 63.0, 0.65, 5),
        (230.0, 60.0, 1.00, 8),
        (275.0, 65.0, 0.75, 6),
        (320.0, 58.0, 1.05, 8),
    ]
    ferns = []
    for i, (angle_deg, fr, scale, n_leaves) in enumerate(fern_ring):
        ang = np.radians(angle_deg)
        x, y = fr * np.cos(ang), fr * np.sin(ang)
        z = surface_z(x, y) - 4.0
        rot = angle_deg - 90.0  # fan opens radially outward from the stem
        fern = make_fern_clump(n_leaves=n_leaves, base_length=40.0 * scale, seed=i + 1)
        fern.apply_transform(trimesh.transformations.rotation_matrix(np.radians(rot), [0, 0, 1]))
        fern.apply_translation([x, y, z])
        ferns.append(fern)
    all_ferns = trimesh.util.concatenate(ferns)
    stone = stone.union(all_ferns, engine="manifold")

    occupied = [(0.0, 0.0, socket_r + 8.0), (small_pos[0], small_pos[1], 16.0)]

    # curling fiddlehead/snail-shell tendrils, coiled up out of the moss
    # near the stem base (matching the spiral accents in the reference)
    curl_specs = [
        # (angle_deg, radius, r0, turns, rise, scale)
        (35.0, 26.0, 8.5, 2.3, 15.0, 1.0),
        (150.0, 30.0, 7.0, 2.0, 12.0, 0.85),
        (205.0, 25.0, 6.5, 2.5, 11.0, 0.8),
        (300.0, 45.0, 8.0, 2.1, 13.0, 0.95),
    ]
    curls = []
    for i, (angle_deg, fr, r0, turns, rise, scale) in enumerate(curl_specs):
        ang = np.radians(angle_deg)
        x, y = fr * np.cos(ang), fr * np.sin(ang)
        curl = make_curl(turns=turns, r0=r0 * scale, tip_r=0.5, rise=rise * scale,
                          thickness=1.3)
        tilt = 12.0 + 8.0 * ((i * 37) % 5) / 5.0
        curl.apply_transform(trimesh.transformations.rotation_matrix(np.radians(tilt), [1, 0, 0]))
        curl.apply_transform(trimesh.transformations.rotation_matrix(ang + np.pi / 2, [0, 0, 1]))
        curl.apply_translation([x, y, surface_z(x, y) - 1.5])
        curls.append(curl)
        occupied.append((x, y, r0 * scale + 4.0))
    all_curls = trimesh.util.concatenate(curls)
    stone = stone.union(all_curls, engine="manifold")

    # tiny bioluminescent light-stick pins dotted around the base
    pin_specs = [(70.0, 48.0), (255.0, 52.0), (170.0, 44.0)]
    pins = []
    for angle_deg, fr in pin_specs:
        ang = np.radians(angle_deg)
        x, y = fr * np.cos(ang), fr * np.sin(ang)
        pin = make_pin(rod_len=16.0, rod_r=0.9, ball_r=2.1)
        pin.apply_translation([x, y, surface_z(x, y) - 0.8])
        pins.append(pin)
        occupied.append((x, y, 4.0))
    all_pins = trimesh.util.concatenate(pins)
    stone = stone.union(all_pins, engine="manifold")

    # a couple of tiny mushroom buds poking out of the moss
    bud_specs = [(120.0, 40.0, 0.16), (340.0, 44.0, 0.20)]
    buds = []
    for angle_deg, fr, scale in bud_specs:
        ang = np.radians(angle_deg)
        x, y = fr * np.cos(ang), fr * np.sin(ang)
        bud = make_small_mushroom(scale=scale)
        bud.apply_translation([x, y, surface_z(x, y) - 2.0])
        buds.append(bud)
        occupied.append((x, y, 10.0))
    all_buds = trimesh.util.concatenate(buds)
    stone = stone.union(all_buds, engine="manifold")

    # dense moss/pebble bump texture covering the open ground between
    # the mushrooms, ferns, curls and pins (matching the mossy base texture
    # in the reference photos)
    moss = make_moss_bumps(count=150, r_min=socket_r + 6.0, r_max=72.0,
                            surface_h=surface_z, seed=7, bump_r=(1.4, 3.6),
                            avoid=occupied)
    stone = stone.union(moss, engine="manifold")

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
