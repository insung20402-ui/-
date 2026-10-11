// Map adapters: Leaflet + OpenStreetMap (default, no key) or Kakao Maps (when an app key is given).
// Both expose the same surface so the app does not care which one is underneath:
//   setNodes(nodes, links)  setCurrent(node, heading)  setHeading(deg)  setCoverage(bool)
//   onClick(cb(lat, lon))   onNodeClick(cb(id))        setPick(bool)    fit()  flyTo(lat, lon)
//   setMarkers([{lat, lon, label}])  - temporary markers while placing photos
(function (root) {
  'use strict';
  var BLUE = '#2d7cff';

  function pegHtml() {
    return '<div class="peg"><svg viewBox="-30 -30 60 60" width="60" height="60"><path d="M0 0 L-17 -27 A32 32 0 0 1 17 -27 Z" fill="rgba(255,90,40,.35)"/>' +
      '<circle r="7" fill="#ff5a28" stroke="#fff" stroke-width="3"/></svg></div>';
  }

  function leaflet(el) {
    var L = root.L;
    var map = L.map(el, { zoomControl: true, attributionControl: true }).setView([37.5665, 126.978], 17);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
    var cover = L.layerGroup().addTo(map), temp = L.layerGroup().addTo(map);
    var peg = null, clickCb = null, nodeCb = null, coverage = true, data = { nodes: [], links: {} };
    var lastHeading = 0;
    map.on('click', function (e) { if (clickCb) clickCb(e.latlng.lat, e.latlng.lng); });

    function draw() {
      cover.clearLayers();
      if (!coverage) return;
      var seen = {}, byId = {};
      data.nodes.forEach(function (n) { byId[n.id] = n; });
      data.nodes.forEach(function (n) {
        (data.links[n.id] || []).forEach(function (l) {
          var k = [n.id, l.target].sort().join('|'), m = byId[l.target];
          if (seen[k] || !m) return;
          seen[k] = 1;
          L.polyline([[n.lat, n.lon], [m.lat, m.lon]], { color: BLUE, weight: 6, opacity: 0.55, interactive: false }).addTo(cover);
        });
      });
      data.nodes.forEach(function (n) {
        L.circleMarker([n.lat, n.lon], { radius: 6, color: '#fff', weight: 2, fillColor: BLUE, fillOpacity: 1 })
          .on('click', function (e) { L.DomEvent.stopPropagation(e); if (nodeCb) nodeCb(n.id); }).addTo(cover);
      });
    }
    return Promise.resolve({
      kind: 'leaflet',
      setNodes: function (nodes, links) { data = { nodes: nodes, links: links }; draw(); },
      setCurrent: function (node, heading) {
        if (!node) { if (peg) { map.removeLayer(peg); peg = null; } return; }
        var icon = L.divIcon({ className: 'peg-icon', html: pegHtml(), iconSize: [60, 60], iconAnchor: [30, 30] });
        if (!peg) peg = L.marker([node.lat, node.lon], { icon: icon, interactive: false, zIndexOffset: 1000 }).addTo(map);
        else peg.setLatLng([node.lat, node.lon]);
        this.setHeading(heading === undefined ? lastHeading : heading);
        if (!map.getBounds().pad(-0.15).contains([node.lat, node.lon])) map.panTo([node.lat, node.lon]);
      },
      setHeading: function (h) {
        lastHeading = h;
        if (peg && peg.getElement()) { var p = peg.getElement().querySelector('.peg'); if (p) p.style.transform = 'rotate(' + h + 'deg)'; }
      },
      setCoverage: function (on) { coverage = on; draw(); },
      onClick: function (cb) { clickCb = cb; },
      onNodeClick: function (cb) { nodeCb = cb; },
      setPick: function (on) { el.style.cursor = on ? 'crosshair' : ''; map.getContainer().style.cursor = on ? 'crosshair' : ''; },
      setMarkers: function (ms) {
        temp.clearLayers();
        ms.forEach(function (m) {
          L.marker([m.lat, m.lon], { icon: L.divIcon({ className: 'pick-icon', html: '<b>' + (m.label || '') + '</b>', iconSize: [26, 26], iconAnchor: [13, 13] }) }).addTo(temp);
        });
        if (ms.length > 1) L.polyline(ms.map(function (m) { return [m.lat, m.lon]; }), { color: '#ff5a28', dashArray: '6 6', weight: 3 }).addTo(temp);
      },
      fit: function () {
        if (!data.nodes.length) return;
        map.fitBounds(L.latLngBounds(data.nodes.map(function (n) { return [n.lat, n.lon]; })), { padding: [60, 60], maxZoom: 19 });
      },
      flyTo: function (lat, lon, z) { map.setView([lat, lon], z || Math.max(map.getZoom(), 18)); },
      invalidate: function () { map.invalidateSize(); },
      raw: map
    });
  }

  function kakao(el, key) {
    return new Promise(function (resolve, reject) {
      function ready() {
        root.kakao.maps.load(function () {
          var K = root.kakao.maps;
          var map = new K.Map(el, { center: new K.LatLng(37.5665, 126.978), level: 3 });
          map.addControl(new K.ZoomControl(), K.ControlPosition.RIGHT);
          var lines = [], dots = [], tempO = [], pegO = null, coverage = true, clickCb = null, nodeCb = null;
          var data = { nodes: [], links: {} }, lastHeading = 0, pegEl = document.createElement('div');
          pegEl.innerHTML = pegHtml();
          K.event.addListener(map, 'click', function (e) { if (clickCb) clickCb(e.latLng.getLat(), e.latLng.getLng()); });
          function clear(a) { a.forEach(function (o) { o.setMap(null); }); a.length = 0; }
          function draw() {
            clear(lines); clear(dots);
            if (!coverage) return;
            var seen = {}, byId = {};
            data.nodes.forEach(function (n) { byId[n.id] = n; });
            data.nodes.forEach(function (n) {
              (data.links[n.id] || []).forEach(function (l) {
                var k = [n.id, l.target].sort().join('|'), m = byId[l.target];
                if (seen[k] || !m) return;
                seen[k] = 1;
                lines.push(new K.Polyline({ map: map, path: [new K.LatLng(n.lat, n.lon), new K.LatLng(m.lat, m.lon)],
                  strokeWeight: 6, strokeColor: BLUE, strokeOpacity: 0.55 }));
              });
            });
            data.nodes.forEach(function (n) {
              var d = document.createElement('div');
              d.className = 'cover-dot';
              d.onclick = function (ev) { ev.stopPropagation(); if (nodeCb) nodeCb(n.id); };
              dots.push(new K.CustomOverlay({ map: map, position: new K.LatLng(n.lat, n.lon), content: d, xAnchor: 0.5, yAnchor: 0.5 }));
            });
          }
          resolve({
            kind: 'kakao',
            setNodes: function (nodes, links) { data = { nodes: nodes, links: links }; draw(); },
            setCurrent: function (node, heading) {
              if (!node) { if (pegO) { pegO.setMap(null); pegO = null; } return; }
              var pos = new K.LatLng(node.lat, node.lon);
              if (!pegO) pegO = new K.CustomOverlay({ map: map, position: pos, content: pegEl, xAnchor: 0.5, yAnchor: 0.5, zIndex: 10 });
              else pegO.setPosition(pos);
              this.setHeading(heading === undefined ? lastHeading : heading);
              if (!map.getBounds().contain(pos)) map.panTo(pos);
            },
            setHeading: function (h) { lastHeading = h; var p = pegEl.querySelector('.peg'); if (p) p.style.transform = 'rotate(' + h + 'deg)'; },
            setCoverage: function (on) { coverage = on; draw(); },
            onClick: function (cb) { clickCb = cb; },
            onNodeClick: function (cb) { nodeCb = cb; },
            setPick: function (on) { el.style.cursor = on ? 'crosshair' : ''; },
            setMarkers: function (ms) {
              clear(tempO);
              ms.forEach(function (m) {
                var d = document.createElement('div'); d.className = 'pick-icon'; d.innerHTML = '<b>' + (m.label || '') + '</b>';
                tempO.push(new K.CustomOverlay({ map: map, position: new K.LatLng(m.lat, m.lon), content: d, xAnchor: 0.5, yAnchor: 0.5 }));
              });
              if (ms.length > 1) tempO.push(new K.Polyline({ map: map, path: ms.map(function (m) { return new K.LatLng(m.lat, m.lon); }),
                strokeWeight: 3, strokeColor: '#ff5a28', strokeStyle: 'shortdash' }));
            },
            fit: function () {
              if (!data.nodes.length) return;
              var b = new K.LatLngBounds();
              data.nodes.forEach(function (n) { b.extend(new K.LatLng(n.lat, n.lon)); });
              map.setBounds(b, 60, 60, 60, 60);
            },
            flyTo: function (lat, lon, level) { map.setCenter(new K.LatLng(lat, lon)); map.setLevel(level || 2); },
            invalidate: function () { map.relayout(); },
            raw: map
          });
        });
      }
      if (root.kakao && root.kakao.maps) return ready();
      var s = document.createElement('script');
      s.src = 'https://dapi.kakao.com/v2/maps/sdk.js?appkey=' + encodeURIComponent(key) + '&autoload=false';
      s.onload = ready;
      s.onerror = function () { reject(new Error('Kakao Maps SDK를 불러오지 못했습니다 (앱 키와 등록한 도메인을 확인하세요)')); };
      document.head.appendChild(s);
    });
  }

  // Kakao when a key is configured and loads; otherwise OpenStreetMap.
  root.RVMaps = {
    create: function (el, kakaoKey) {
      if (!kakaoKey) return leaflet(el);
      return kakao(el, kakaoKey).catch(function (err) {
        console.warn(err.message);
        el.innerHTML = '';
        return leaflet(el).then(function (m) { m.fallbackReason = err.message; return m; });
      });
    }
  };
})(window);
