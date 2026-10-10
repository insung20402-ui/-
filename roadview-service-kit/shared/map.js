// Map side (Leaflet, no tile server): vector basemap drawn from the city
// model, coverage layer, click -> nearest panorama, and a walker marker whose
// position/heading/FOV stay in sync with a bound viewer.
(function (root) {
  'use strict';
  var RV = root.RV;

  var THEMES = {
    light: {
      bg: '#eef0f2', block: '#e4e6e9', road: '#ffffff', building: '#d9d4cb', buildingStroke: '#c2bcb1',
      park: '#cde6c2', coverage: '#2f7df6', walker: '#ff5a36', label: '#5b6470', miss: '#e5484d'
    },
    dark: {
      bg: '#10141a', block: '#161b22', road: '#2b333e', building: '#1e252e', buildingStroke: '#323c48',
      park: '#1a3324', coverage: '#4ea1ff', walker: '#ffb020', label: '#8a96a6', miss: '#ff6b6b'
    }
  };

  var styleInjected = false;
  function injectStyle() {
    if (styleInjected) return;
    styleInjected = true;
    var s = document.createElement('style');
    s.textContent =
      '.rv-label{font:600 11px/1 system-ui,sans-serif;white-space:nowrap;pointer-events:none;' +
      'transform:translate(-50%,-50%);text-shadow:0 0 3px var(--rv-halo,#fff),0 0 3px var(--rv-halo,#fff)}' +
      '.rv-walker{pointer-events:auto;cursor:grab}' +
      '.rv-walker svg{display:block;overflow:visible}';
    document.head.appendChild(s);
  }

  RV.createMap = function (el, opts) {
    opts = opts || {};
    injectStyle();
    var L = root.L;
    var colors = {};
    var base = THEMES[opts.theme === 'dark' ? 'dark' : 'light'];
    Object.keys(base).forEach(function (k) { colors[k] = (opts.colors && opts.colors[k]) || base[k]; });
    var radiusM = opts.radiusM || 50;
    var listeners = {};
    var viewer = null;
    var cityYear = RV.VINTAGES[RV.VINTAGES.length - 1].year;
    var coverageYear = 'latest';

    function on(name, cb) { (listeners[name] = listeners[name] || []).push(cb); return api; }
    function emit(name, payload) {
      (listeners[name] || []).slice().forEach(function (cb) { cb(payload); });
    }
    function ll(x, y) { var p = RV.toLatLon(x, y); return [p.lat, p.lon]; }

    el.style.background = colors.bg;
    el.style.setProperty('--rv-halo', colors.bg);
    var map = L.map(el, {
      zoomControl: opts.zoomControl !== false, attributionControl: false,
      zoomSnap: 0.25, minZoom: 15, maxZoom: 21
    });
    var baseLayer = L.layerGroup().addTo(map);
    var coverageLayer = L.layerGroup();
    var bounds = L.latLngBounds(ll(-46, -46), ll(366, 286));
    map.fitBounds(bounds);
    map.setMaxBounds(bounds.pad(0.6));

    function label(x, y, text) {
      return L.marker(ll(x, y), {
        interactive: false, keyboard: false,
        icon: L.divIcon({ className: '', iconSize: [0, 0],
          html: '<div class="rv-label" style="color:' + colors.label + '">' + text + '</div>' })
      });
    }

    function drawBase() {
      baseLayer.clearLayers();
      var city = RV.cityFor(cityYear);
      var H = RV.ROAD_HALF;
      L.rectangle([ll(-46, -46), ll(366, 286)], { stroke: false, fillColor: colors.block, fillOpacity: 1, interactive: false }).addTo(baseLayer);
      city.parks.forEach(function (p) {
        L.rectangle([ll(p.x0, p.y0), ll(p.x1, p.y1)], { stroke: false, fillColor: colors.park, fillOpacity: 1, interactive: false }).addTo(baseLayer);
        label((p.x0 + p.x1) / 2, p.y0 + 16, p.name).addTo(baseLayer);
      });
      RV.roads.forEach(function (r) {
        var x0 = Math.min(r.a[0], r.b[0]) - H, x1 = Math.max(r.a[0], r.b[0]) + H;
        var y0 = Math.min(r.a[1], r.b[1]) - H, y1 = Math.max(r.a[1], r.b[1]) + H;
        L.rectangle([ll(x0, y0), ll(x1, y1)], { stroke: false, fillColor: colors.road, fillOpacity: 1, interactive: false }).addTo(baseLayer);
      });
      city.buildings.forEach(function (b) {
        L.rectangle([ll(b.x0, b.y0), ll(b.x1, b.y1)], {
          color: colors.buildingStroke, weight: 1, fillColor: b.kind === 'fence' ? '#e8c33a' : colors.building,
          fillOpacity: b.kind === 'fence' ? 0.45 : 1, dashArray: b.kind === 'fence' ? '4 3' : null, interactive: false
        }).addTo(baseLayer);
        if (b.name) label((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, b.name).addTo(baseLayer);
      });
      RV.roads.forEach(function (r) {
        // offset labels off the centerline so they do not sit under the coverage line
        var horizontal = r.heading === 90;
        label(r.a[0] + (r.b[0] - r.a[0]) * 0.3 + (horizontal ? 0 : 17),
          r.a[1] + (r.b[1] - r.a[1]) * 0.3 + (horizontal ? 8 : 0), r.name).addTo(baseLayer);
      });
    }

    function drawCoverage() {
      coverageLayer.clearLayers();
      RV.coverage().forEach(function (c) {
        if (coverageYear !== 'latest' && c.years.indexOf(Number(coverageYear)) < 0) return;
        L.polyline(c.path, { color: colors.coverage, weight: 5, opacity: 0.55, lineCap: 'round', interactive: false }).addTo(coverageLayer);
      });
    }

    // ---- walker marker (position + heading + FOV wedge) ----
    function walkerHtml(fov) {
      var half = Math.max(12, Math.min(60, fov * 0.65)) * Math.PI / 180;
      var r = 34, c = 40;
      var x1 = c + r * Math.sin(-half), y1 = c - r * Math.cos(-half);
      var x2 = c + r * Math.sin(half), y2 = c - r * Math.cos(half);
      return '<svg width="80" height="80" viewBox="0 0 80 80"><g class="rv-rot" style="transform-origin:40px 40px">' +
        '<path d="M40 40 L' + x1.toFixed(1) + ' ' + y1.toFixed(1) + ' A' + r + ' ' + r + ' 0 0 1 ' + x2.toFixed(1) + ' ' + y2.toFixed(1) + ' Z" fill="' + colors.walker + '" fill-opacity="0.32"/>' +
        '</g><circle cx="40" cy="40" r="7" fill="' + colors.walker + '" stroke="#fff" stroke-width="2.5"/></svg>';
    }
    var walker = null, walkerFov = null, walkerNode = null;
    function setWalker(nodeId, heading, fov) {
      var node = RV.getNode(nodeId);
      if (!node) return;
      walkerNode = node;
      var rounded = Math.round(fov / 5) * 5;
      if (!walker) {
        walker = L.marker([node.lat, node.lon], {
          draggable: true, zIndexOffset: 1000,
          icon: L.divIcon({ className: 'rv-walker', iconSize: [80, 80], iconAnchor: [40, 40], html: walkerHtml(rounded) })
        }).addTo(map);
        walkerFov = rounded;
        walker.on('dragend', function () {
          var p = walker.getLatLng();
          if (!pick(p.lat, p.lng, Math.max(radiusM, 80))) walker.setLatLng([walkerNode.lat, walkerNode.lon]);
        });
      } else {
        walker.setLatLng([node.lat, node.lon]);
        if (rounded !== walkerFov) {
          walkerFov = rounded;
          walker.getElement().innerHTML = walkerHtml(rounded);
        }
      }
      var rot = walker.getElement() && walker.getElement().querySelector('.rv-rot');
      if (rot) rot.style.transform = 'rotate(' + heading + 'deg)';
    }

    function pick(lat, lon, radius) {
      var hit = RV.findNearest(lat, lon, radius, { year: coverageYear });
      if (!hit) {
        var ring = L.circle([lat, lon], { radius: radius, color: colors.miss, weight: 1.5, dashArray: '5 4', fillOpacity: 0.08, interactive: false }).addTo(map);
        setTimeout(function () { map.removeLayer(ring); }, 1100);
        emit('no_coverage', { lat: lat, lon: lon, radiusM: radius });
        return false;
      }
      emit('pick', { nodeId: hit.node.id, distanceM: hit.distanceM, lat: lat, lon: lon });
      if (viewer) viewer.setPano(hit.node.id);
      return true;
    }
    map.on('click', function (e) { pick(e.latlng.lat, e.latlng.lng, radiusM); });

    function bindViewer(v) {
      viewer = v;
      function sync() {
        var s = v.getState();
        if (s.nodeId === null) return;
        if (s.year !== cityYear) { cityYear = s.year; drawBase(); }
        setWalker(s.nodeId, s.heading, s.fov);
        var node = RV.getNode(s.nodeId);
        if (!map.getBounds().pad(-0.12).contains([node.lat, node.lon])) map.panTo([node.lat, node.lon]);
      }
      v.on('pano_changed', sync);
      v.on('pov_changed', function (p) {
        var s = v.getState();
        if (s.nodeId !== null) setWalker(s.nodeId, p.heading, p.fov);
      });
      sync();
      return api;
    }

    drawBase();
    drawCoverage();
    if (opts.showCoverage !== false) coverageLayer.addTo(map);

    var api = {
      on: on,
      leaflet: map,
      bindViewer: bindViewer,
      setCoverageVisible: function (flag) {
        if (flag) coverageLayer.addTo(map); else map.removeLayer(coverageLayer);
      },
      // 'latest' = every captured road; a year = only roads captured that year (also filters click search)
      setCoverageYear: function (y) { coverageYear = y; drawCoverage(); },
      setWalker: setWalker,
      pick: function (lat, lon, radius) { return pick(lat, lon, radius || radiusM); },
      fit: function () { map.fitBounds(bounds); },
      invalidateSize: function () { map.invalidateSize(); },
      destroy: function () { map.remove(); }
    };
    return api;
  };
})(window);
