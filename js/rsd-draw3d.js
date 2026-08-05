(function (global) {
  // 3D 부지 뷰 — 실형상으로 세운 원료 저장설비
  //
  // 좌표계 (미터 단위 그대로)
  //   X = 길이방향 (야드 길이)
  //   Y = 높이
  //   Z = 폭방향 (띠가 쌓이는 방향)
  //
  // 파일 1개 = 삼각기둥 + 양끝 원뿔.
  // 원뿔은 프리즘 단면에 정확히 내접하므로(둘 다 안식각이 같다) 끝단에 온전한 원뿔을
  // 놓아도 안쪽 절반은 프리즘에 묻힌다 — 형상이 정확하면서 지오메트리는 단순해진다.

  const CONCRETE = 0x55554f;
  const APRON    = 0x8a8a83;
  const STEEL    = 0x7c8794;
  const SHED_RF  = 0xb8bcc2;
  const SILO_C   = 0xc9c7c2;

  let THREE = null;
  let renderer = null, scene = null, camera = null, controls = null;
  let siteGroup = null, raf = 0, host = null, running = false;
  let animList = [], playing = true, t0 = 0;
  let hiddenMaterials = {};

  // 출력이 sRGB 인코딩이므로 재질 색은 선형공간으로 변환해서 넣어야 한다.
  // 이 변환을 빠뜨리면 모든 색이 뿌옇게 떠서 원료가 구분되지 않는다.
  function col(hex) { return new THREE.Color(hex).convertSRGBToLinear(); }

  // ---------- 지오메트리 ----------

  // 스톡파일 1개 (길이 len, 적치폭 width, 적치높이 height)
  function makePile(len, width, height, material) {
    const g = new THREE.Group();
    const r = width / 2;
    const prismLen = Math.max(0, len - width);

    if (prismLen > 0) {
      // 삼각 단면을 길이방향으로 압출
      const shape = new THREE.Shape();
      shape.moveTo(-r, 0);
      shape.lineTo(0, height);
      shape.lineTo(r, 0);
      shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: prismLen, bevelEnabled: false });
      geo.rotateY(Math.PI / 2);        // 압출축 Z → X (길이방향)
      geo.translate(r, 0, 0);          // 끝단 원뿔 자리를 비워 둔다
      const m = new THREE.Mesh(geo, material);
      m.castShadow = true; m.receiveShadow = true;
      g.add(m);
    }

    // 양끝 원뿔
    const coneGeo = new THREE.ConeGeometry(r, height, 40, 1);
    coneGeo.translate(0, height / 2, 0);
    [r, len - r].forEach(function (cx) {
      const c = new THREE.Mesh(coneGeo, material);
      c.position.x = cx;
      c.castShadow = true; c.receiveShadow = true;
      g.add(c);
    });

    return g;
  }

  // 원형 Silo 1기
  function makeSilo(dia, height, mat, roofMat) {
    const g = new THREE.Group();
    const r = dia / 2;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, height, 40), mat);
    body.position.y = height / 2;
    body.castShadow = true; body.receiveShadow = true;
    g.add(body);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(r * 1.03, r * 0.32, 40), roofMat);
    roof.position.y = height + r * 0.16;
    roof.castShadow = true;
    g.add(roof);
    return g;
  }

  // Shed 건물 (PEB 박공지붕)
  //
  // 지붕만 반투명으로 덮어 위에서 안이 들여다보이게 한다.
  // 골조(기둥·서까래)를 세워 봤더니 대각선이 잔뜩 생겨 형상만 어지러웠다 —
  // 예전 형상 그대로 두고 지붕 재질만 바꾸는 편이 훨씬 깨끗하다.
  function makeShed(len, width, height, wallMat, roofMat) {
    const g = new THREE.Group();
    const wallH = height * 0.49;

    // 벽체는 **속이 빈 껍데기**로 세운다.
    // 통짜 박스로 만들면 윗면이 생겨서, 지붕을 아무리 투명하게 해도
    // 그 윗면이 안을 가려 버린다. 겉모습은 통짜와 똑같다.
    const wall = function (w, x, z, rotY) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, wallH), wallMat);
      m.position.set(x, wallH / 2, z);
      m.rotation.y = rotY;
      m.castShadow = true; m.receiveShadow = true;
      g.add(m);
    };
    wall(len, 0, -width / 2, 0);            // 측벽 2장
    wall(len, 0, width / 2, Math.PI);
    wall(width, -len / 2, 0, -Math.PI / 2); // 양단벽 2장
    wall(width, len / 2, 0, Math.PI / 2);

    // 박공지붕 — 삼각 단면을 길이방향으로 압출
    const roofH = height - wallH;
    const shape = new THREE.Shape();
    shape.moveTo(-width / 2, 0);
    shape.lineTo(0, roofH);
    shape.lineTo(width / 2, 0);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false });
    geo.rotateY(Math.PI / 2);
    geo.translate(-len / 2, wallH, 0);
    const roof = new THREE.Mesh(geo, roofMat);
    roof.castShadow = true;
    g.add(roof);
    return g;
  }

  // 축척 기준물 — 대형 덤프트럭. "60 m 높이"가 얼마나 큰지 전달한다.
  function makeTruck(mat, cabMat) {
    const g = new THREE.Group();
    const bed = new THREE.Mesh(new THREE.BoxGeometry(11, 3.2, 4.2), mat);
    bed.position.y = 2.6; bed.castShadow = true;
    g.add(bed);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 4), cabMat);
    cab.position.set(6.4, 3.0, 0); cab.castShadow = true;
    g.add(cab);
    return g;
  }

  // ---------- 배치 ----------

  function shade0(m) { m.castShadow = true; m.receiveShadow = true; return m; }

  function disposeGroup(g) {
    g.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach(function (m) { m.dispose(); });
        else o.material.dispose();
      }
    });
  }

  function buildSite(state, result) {
    if (siteGroup) { scene.remove(siteGroup); disposeGroup(siteGroup); }
    siteGroup = new THREE.Group();

    const bands = global.RSD.bands.buildBands(state, result);
    let siteLen = 0, siteDepth = 0, siteHeight = 10;
    bands.forEach(function (b) {
      if (b.length > siteLen) siteLen = b.length;
      siteDepth += b.width;
      if (b.kind === 'yard') siteHeight = Math.max(siteHeight, b.sizing.pileHeight.value);
      if (b.kind === 'silo') siteHeight = Math.max(siteHeight, b.totalHeight || state.silo.totalHeight);
      if (b.kind === 'shed') siteHeight = Math.max(siteHeight, state.shed.totalHeight);
    });
    if (siteLen === 0) siteLen = 100;
    if (siteDepth === 0) siteDepth = 60;

    const steelMat = new THREE.MeshStandardMaterial({ color: col(STEEL), roughness: .55, metalness: .4 });
    const accentMat = new THREE.MeshStandardMaterial({ color: col(0xd8a12a), roughness: .6, metalness: .2 });
    const yellowMat = new THREE.MeshStandardMaterial({ color: col(0xf2c230), roughness: .55, metalness: .1 });
    const motorMat  = new THREE.MeshStandardMaterial({ color: col(0x2a63b8), roughness: .45, metalness: .3 });
    const darkMat   = new THREE.MeshStandardMaterial({ color: col(0x3c424a), roughness: .5, metalness: .5 });
    const apronMat = new THREE.MeshStandardMaterial({ color: col(APRON), roughness: 1 });
    const siloMat  = new THREE.MeshStandardMaterial({ color: col(SILO_C), roughness: .85 });
    const roofMat  = new THREE.MeshStandardMaterial({ color: col(SHED_RF), roughness: .5, metalness: .3 });

    // 지면 — 가장자리가 화면에 걸리지 않도록 부지보다 훨씬 넓게 깔고 안개로 감춘다
    const span = Math.max(siteLen, siteDepth) * 3.2;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(span, span),
      new THREE.MeshStandardMaterial({ color: col(CONCRETE), roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    siteGroup.add(ground);

    // 띠를 Z 방향으로 쌓는다 (부지 중심이 원점)
    // 띠 좌표는 rsd-bands 가 계산한다 — 2D 마스터플랜과 같은 식을 쓰기 위해서다
    const layout = global.RSD.bands.bandLayout(bands);
    const E3 = global.RSD.equip3d;
    const EQ = global.RSD.equip;
    E3.use(THREE);

    let srIndex = 0;
    bands.forEach(function (b, bi) {
      const zc = layout[bi].zc;
      const x0 = layout[bi].x0;

      // 띠마다 그룹을 두고 원료 키를 달아 둔다 — 표시 토글이 그룹 단위로 끝난다
      const bg = new THREE.Group();
      bg.userData.materialKey = b.material ? b.material.key : null;
      siteGroup.add(bg);

      const oreMat = b.material
        ? new THREE.MeshStandardMaterial({ color: col(b.material.color), roughness: 1, metalness: 0 })
        : apronMat;

      if (b.kind === 'yard') {
        const s = b.sizing;
        const apron = new THREE.Mesh(new THREE.PlaneGeometry(b.length, b.width), apronMat);
        apron.rotation.x = -Math.PI / 2;
        apron.position.set(0, 0.02, zc);
        apron.receiveShadow = true;
        bg.add(apron);

        const geo = global.RSD.draw2d.yardPlanGeometry({
          A: state.yard.yardLength, B: state.yard.maintLength,
          D: state.yard.yardWidth, E: state.yard.roadWidth,
          I: b.pileCount, J: b.pileGap,
          C: s.stackLength.value, F: s.stackWidth.value,
          rows: 1, srBandWidth: state.yard.srBandWidth
        });
        // 통행로가 양측 절반씩이므로 적치열 중심은 곧 야드 중앙이다
        const pileZ = zc;
        geo.piles.forEach(function (p) {
          if (p.w <= 0) return;
          const pile = makePile(p.w, s.stackWidth.value, s.pileHeight.value, oreMat);
          pile.position.set(x0 + p.x, 0, pileZ);
          bg.add(pile);
        });

      } else if (b.kind === 'sr') {
        const band = new THREE.Mesh(new THREE.PlaneGeometry(b.length, b.width), apronMat);
        band.rotation.x = -Math.PI / 2;
        band.position.set(0, 0.03, zc);
        band.receiveShadow = true;
        bg.add(band);

        // 벨트 컨베이어 갤러리 + 그 위를 흐르는 원료
        const gal = E3.makeGallery({ len: b.length, mat: steelMat, height: 5.0 });
        gal.position.set(0, 0, zc);
        bg.add(gal);
        const flow = E3.makeFlow({ len: b.length, mat: oreMat, y: 5.5, speed: 24 });
        flow.position.set(0, 0, zc);
        bg.add(flow);

        // 야드 하역기 — 수량·종류는 rsd-equip 이 정한다
        const ph = b.sizing ? b.sizing.pileHeight.value : 15;
        const list = EQ.yardEquipment({ mode: state.yard.srMode, perBand: state.yard.srPerBand });
        list.forEach(function (m, i) {
          const mc = E3.makeYardMachine({
            type: m.type,
            // 붐은 야드 폭의 대부분을 덮어야 전 구간 적치·불출이 된다
            boomLen: state.yard.yardWidth * 0.92,
            mastH: ph * 2.1,
            wheelR: ph * 0.42,
            railSpan: b.width,
            // 기계마다 마주보는 야드를 향하게 해서 좌우 야드를 모두 담당한다
            facing: (i % 2 === 0) ? 1 : -1,
            dropHeight: ph * 0.9,
            mat: steelMat, accentMat: accentMat,
            yellowMat: yellowMat, railMat: darkMat, oreMat: oreMat
          });
          const cx = x0 + b.length * m.xRatio;
          mc.position.set(cx, 0, zc);
          // 자기 담당 구역 안에서만 왕복한다 — 이웃 기계와 만나지 않는다.
          // 띠마다 위상을 어긋나게 해서 여러 야드가 나란히 움직이지 않게 한다.
          mc.userData.anim = {
            kind: 'travel', axis: 'x',
            center: cx,
            range: b.length * m.travelRatio,
            period: 34 + srIndex * 5 + i * 3,
            phase: i * 0.5 + srIndex * 0.27
          };
          bg.add(mc);
        });
        srIndex++;

      } else if (b.kind === 'silo') {
        const s = b.sizing;
        const n = s.count.value;
        const topY = s.totalHeight.value;
        // 배치 좌표는 rsd-equip.siloLayout 이 계산한다 — 그림 그리는 코드 안에
        // 좌표식을 흩어 두면 확인할 방법이 없다 (실제로 불출 B/C 결함이 거기서 났다)
        const SL = EQ.siloLayout({
          count: n, perRow: s.perRow.value, pitch: s.pitch.value,
          innerDia: s.innerDia.value, footprintWidth: s.footprintWidth.value,
          length: b.length
        });
        const rowsN = SL.rows;
        SL.silos.forEach(function (sp) {
          const silo = makeSilo(s.innerDia.value, topY, siloMat, roofMat);
          silo.position.set(sp.x, 0, zc + sp.z);
          bg.add(silo);
          // 하부 RDM 배출부 — Silo 1기당 1기. 실물은 몸통 밑에 들어가 있고
          // 원료를 옆으로 밀어내 벨트에 싣는다.
          const dis = E3.makeSiloDischarge({
            dia: s.innerDia.value, mat: steelMat, accentMat: accentMat
          });
          dis.position.set(sp.x, 0, zc + sp.rdmZ);
          bg.add(dis);
        });

        // 상부 공급 갤러리 + Tripper — 열마다 Silo 중심 위를 지나야 장입이 된다
        const se = EQ.siloEquipment({ trippers: state.silo.trippers, count: n, rows: rowsN });
        for (let rr = 0; rr < rowsN; rr++) {
          const rz = zc + SL.feedZ[rr];   // 그 열 Silo 중심선

          const gal = E3.makeGallery({ len: b.length, mat: steelMat, height: 3.0, width: 3.6 });
          gal.position.set(0, topY + 2.5, rz);
          bg.add(gal);
          const flow = E3.makeFlow({ len: b.length, mat: oreMat, y: topY + 6.0, speed: 28 });
          flow.position.set(0, 0, rz);
          bg.add(flow);

          // 그 열이 맡을 Tripper — 담당 구역을 나눠 겹치지 않게 주행
          const nT = Math.max(1, se.trippersPerRow);
          for (let i = 0; i < nT; i++) {
            const tp = E3.makeTripper({ width: 12, height: 13, mat: steelMat,
              accentMat: accentMat, motorMat: motorMat, oreMat: oreMat,
              dropHeight: 9, twoWay: false });
            const zoneW = b.length / nT;
            const cx = x0 + zoneW * (i + 0.5);
            tp.position.set(cx, topY + 2.5, rz);
            tp.userData.anim = {
              kind: 'travel', axis: 'x',
              center: cx, range: zoneW * 0.78,
              period: 26 + i * 4 + rr * 3, phase: i * 0.5 + rr * 0.31
            };
            bg.add(tp);
          }
        }

        // 하부 불출 B/C — Silo 밑을 가로지르는 게 아니라 **열마다 옆에 나란히** 붙는다.
        // (한 줄만 놓으면 2열 이상일 때 안쪽 열은 불출 경로가 없다)
        SL.outZ.forEach(function (oz) {
          const outGal = E3.makeGallery({ len: b.length, mat: steelMat, height: 2.4, width: 2.6 });
          outGal.position.set(0, 0, zc + oz);
          bg.add(outGal);
          // 벨트 위를 흐르는 원료 — 불출이 실제로 일어나는 게 보여야 한다
          const outFlow = E3.makeFlow({ len: b.length, mat: oreMat, y: 3.0, speed: 24 });
          outFlow.position.set(0, 0, zc + oz);
          bg.add(outFlow);
        });

      } else if (b.kind === 'shed') {
        // 형상은 예전 그대로 — 벽체는 불투명, **지붕만 반투명**으로 덮어
        // 위에서 내려다보면 안의 원료 더미·Tripper·SPR 이 보이게 한다.
        const H = state.shed.totalHeight;
        const wallTop = H * 0.49;
        const wallMat = new THREE.MeshStandardMaterial({
          color: col(0xd6d8db), roughness: .8, side: THREE.DoubleSide
        });
        const glassRoof = new THREE.MeshStandardMaterial({
          color: col(SHED_RF), roughness: .45, metalness: .25,
          transparent: true, opacity: 0.28, side: THREE.DoubleSide,
          depthWrite: false      // 이걸 켜 두면 지붕이 안쪽 물체를 가려 버린다
        });
        const shed = makeShed(b.length, b.width, H, wallMat, glassRoof);
        shed.position.set(0, 0, zc);
        bg.add(shed);

        const bays = Math.max(1, state.shed.bays);
        const bayW = b.width / bays;
        const sz = b.sizing;
        const sec = sz.section;
        const Lb = state.shed.Lb, La = state.shed.La;
        const cw = state.shed.centerWallThickness;
        const mz = state.shed.maintZone, wt = state.shed.wallThickness;

        const cwallMat = new THREE.MeshStandardMaterial({ color: col(0x9a9a94), roughness: .95 });

        // 셀별 원료 더미 + 격벽 — 좌표는 rsd-equip.shedLayout 이 계산한다
        // (압출 방향 부호를 그리는 코드 안에서 잡다가 더미가 옹벽을 뚫은 적이 있다)
        const SL = EQ.shedLayout({
          bays: bays, length: b.length, width: b.width,
          centerWall: cw, maintZone: mz, wallThickness: wt,
          Lb: Lb, La: La, openSideClear: state.shed.openSideClear,
          cells: sz.cells || []
        });
        const cellByIdx = {};
        (sz.cells || []).forEach(function (c, i) { cellByIdx[i] = c; });

        // 중앙 옹벽 — Tripper 가 이 위를 달린다.
        // 1 bay 면 건물 한쪽 끝에 붙으므로 자리는 layout 이 정한다.
        const cwall = shade0(new THREE.Mesh(
          new THREE.BoxGeometry(b.length, sec.h1.value + 4, cw), cwallMat));
        cwall.position.set(0, (sec.h1.value + 4) / 2, zc + SL.wallCenter);
        bg.add(cwall);

        SL.piles.forEach(function (pl, i) {
          const c = (sz.cells || [])[i] || {};
          const ms = (sz.sections && pl.key && sz.sections[pl.key]) ? sz.sections[pl.key] : sec;
          const pmat = c.color
            ? new THREE.MeshStandardMaterial({ color: col(c.color), roughness: 1 })
            : oreMat;
          const pile = E3.makeShedPile({
            len: pl.len, Lb: Lb, La: La,
            h1: ms.h1.value, wallHeight: ms.wallHeight.value, mat: pmat
          });
          // 압출 형상은 rotateY(+90°) 때문에 단면 x 가 월드 −z 로 간다.
          // +z 쪽 bay 는 뒤집어야 옹벽 밖으로 나간다.
          pile.position.set(pl.x, 0, zc + pl.z);
          pile.scale.z = -pl.dir;
          bg.add(pile);
        });
        SL.partitions.forEach(function (pt) {
          const part = shade0(new THREE.Mesh(
            new THREE.BoxGeometry(wt, sec.h1.value + 2, pt.depth), cwallMat));
          part.position.set(pt.x, (sec.h1.value + 2) / 2, zc + pt.zCenter);
          bg.add(part);
        });

        const she = EQ.shedEquipment({
          bays: bays, sprPerBay: state.shed.sprPerBay, trippers: state.shed.trippers
        });

        // 적치 — Tripper 가 중앙 옹벽 위를 달리며 양쪽 Cell 로 떨군다
        for (let i = 0; i < she.trippers; i++) {
          const tp = E3.makeTripper({ width: 15, height: 14, mat: steelMat,
            accentMat: accentMat, motorMat: motorMat, oreMat: oreMat,
            dropHeight: 12, twoWay: true });
          const zoneW = b.length / she.trippers;
          const cx = -b.length / 2 + zoneW * (i + 0.5);
          tp.position.set(cx, sec.h1.value + 4, zc + SL.wallCenter);
          tp.userData.anim = {
            kind: 'travel', axis: 'x',
            center: cx, range: zoneW * 0.78, period: 30 + i * 5, phase: i * 0.5
          };
          bg.add(tp);
        }
        // 공급 B/C — Tripper 에 원료를 실어 나른다
        const feed = E3.makeGallery({ len: b.length, mat: steelMat, height: sec.h1.value + 2, width: 3.0 });
        feed.position.set(0, 0, zc + SL.wallCenter);
        bg.add(feed);
        const feedFlow = E3.makeFlow({ len: b.length, mat: oreMat, y: sec.h1.value + 5.5, speed: 26 });
        feedFlow.position.set(0, 0, zc + SL.wallCenter);
        bg.add(feedFlow);

        // 불출 — SPR 이 개방측 빗변을 긁어 하부 B/C 로 보낸다
        for (let bay = 0; bay < bays; bay++) {
          const sg = (bays === 1) ? 1 : (bay === 0 ? -1 : 1);
          const bayCz = zc + SL.wallCenter + sg * (cw / 2 + (Lb + La) / 2);
          for (let k = 0; k < she.sprPerBay; k++) {
            const spr = E3.makeSPR({
              Lb: Lb, La: La, h1: sec.h1.value, wallTop: wallTop,
              mat: steelMat, accentMat: accentMat,
              yellowMat: yellowMat, railMat: darkMat, cabMat: motorMat
            });
            const zoneW = b.length / she.sprPerBay;
            const cx = -b.length / 2 + zoneW * (k + 0.5);
            spr.position.set(cx, 0, bayCz);
            spr.rotation.y = (sg > 0) ? 0 : Math.PI;
            spr.userData.anim = {
              kind: 'travel', axis: 'x',
              center: cx, range: zoneW * 0.7, period: 22 + k * 3, phase: (bay + k) * 0.4
            };
            bg.add(spr);
          }
          // 하부 불출 B/C — 개방측 바깥에 면마다 1 Line
          const outZ = zc + SL.outBelts[bay].z;
          const og = E3.makeGallery({ len: b.length, mat: steelMat, height: 2.2, width: 2.4 });
          og.position.set(0, 0, outZ);
          bg.add(og);
          const of = E3.makeFlow({ len: b.length, mat: oreMat, y: 2.8, speed: 22 });
          of.position.set(0, 0, outZ);
          bg.add(of);
        }
      }

      /* 다음 띠 위치는 layout 이 이미 들고 있다 */
    });

    // 축척 기준물 — 부지 앞쪽에 덤프트럭 3대
    const truckMat = new THREE.MeshStandardMaterial({ color: col(0xd8a12a), roughness: .7 });
    const cabMat = new THREE.MeshStandardMaterial({ color: col(0x3a3f46), roughness: .6 });
    for (let i = 0; i < 3; i++) {
      const t = makeTruck(truckMat, cabMat);
      t.position.set(-siteLen * 0.3 + i * 26, 0, -siteDepth / 2 - 14);
      siteGroup.add(t);
    }

    const site = { len: siteLen, depth: siteDepth, height: siteHeight };
    siteGroup.add(buildDims(site));

    scene.add(siteGroup);
    animList = global.RSD.equip3d.collectAnimated(siteGroup);
    applyHidden();
    return site;
  }

  // ---------- 3D 주요 치수 ----------
  //
  // 치수선은 부지 바깥에 놓아 설비와 겹치지 않게 한다.
  // 좌표 산출은 순수 함수로 떼어 node 에서 검증한다.
  function dimSpec(site) {
    const L = site.len, D = site.depth, H = site.height;
    const off = Math.max(D * 0.35, 26);      // 부지에서 띄우는 거리
    const zOut = D / 2 + off;
    const xOut = L / 2 + off;
    const fmt = function (v) { return (v % 1 === 0) ? String(v) : v.toFixed(1); };

    return [
      { from: [-L / 2, 0, zOut], to: [L / 2, 0, zOut],
        text: '총 길이 ' + fmt(L) + ' m' },
      { from: [xOut, 0, -D / 2], to: [xOut, 0, D / 2],
        text: '총 폭 ' + fmt(D) + ' m' },
      { from: [-L / 2 - off * 0.5, 0, -D / 2], to: [-L / 2 - off * 0.5, H, -D / 2],
        text: '최고 높이 ' + fmt(H) + ' m' }
    ];
  }

  // 스프라이트용 텍스트 캔버스 — 항상 카메라를 향하므로 어느 각도에서도 읽힌다
  function labelCanvas(text, dark) {
    const pad = 16, fs = 44;
    const cv = document.createElement('canvas');
    const ctx = cv.getContext('2d');
    ctx.font = '600 ' + fs + 'px -apple-system, "Segoe UI", sans-serif';
    const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
    cv.width = w; cv.height = fs + pad * 2;
    const c2 = cv.getContext('2d');
    c2.font = '600 ' + fs + 'px -apple-system, "Segoe UI", sans-serif';
    c2.fillStyle = dark ? 'rgba(20,22,26,.82)' : 'rgba(255,255,255,.88)';
    c2.strokeStyle = dark ? 'rgba(255,255,255,.22)' : 'rgba(0,0,0,.18)';
    c2.lineWidth = 3;
    const r = 14;
    c2.beginPath();
    c2.moveTo(r, 0); c2.arcTo(cv.width, 0, cv.width, cv.height, r);
    c2.arcTo(cv.width, cv.height, 0, cv.height, r);
    c2.arcTo(0, cv.height, 0, 0, r); c2.arcTo(0, 0, cv.width, 0, r);
    c2.closePath(); c2.fill(); c2.stroke();
    c2.fillStyle = dark ? '#e9ecf1' : '#1c1d21';
    c2.textBaseline = 'middle';
    c2.fillText(text, pad, cv.height / 2 + 2);
    return cv;
  }

  function buildDims(site) {
    const g = new THREE.Group();
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    const lineMat = new THREE.LineBasicMaterial({
      color: col(dark ? 0x8a93a0 : 0x5d6772), transparent: true, opacity: .95
    });
    const tick = Math.max(site.height * 0.22, site.len * 0.018, 6);

    dimSpec(site).forEach(function (d) {
      const a = new THREE.Vector3(d.from[0], d.from[1], d.from[2]);
      const b = new THREE.Vector3(d.to[0], d.to[1], d.to[2]);

      // WebGL 의 Line 은 굵기를 지정할 수 없어 멀리서 사라진다 — 얇은 실린더로 그린다
      const len = a.distanceTo(b);
      const rod = new THREE.Mesh(
        new THREE.CylinderGeometry(tick * 0.07, tick * 0.07, len, 6),
        new THREE.MeshBasicMaterial({ color: lineMat.color })
      );
      rod.position.copy(a).lerp(b, 0.5);
      rod.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3().subVectors(b, a).normalize()
      );
      g.add(rod);

      // 양끝 화살표
      const dir = new THREE.Vector3().subVectors(b, a).normalize();
      [[a, 1], [b, -1]].forEach(function (e) {
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry(tick * 0.28, tick, 10),
          new THREE.MeshBasicMaterial({ color: lineMat.color })
        );
        cone.position.copy(e[0]);
        cone.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          dir.clone().multiplyScalar(e[1])
        );
        g.add(cone);
      });

      // 라벨 스프라이트
      const cv = labelCanvas(d.text, dark);
      const tex = new THREE.CanvasTexture(cv);
      tex.needsUpdate = true;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
      // 부지 길이에 비례시켜야 멀리서도 읽힌다
      const h = Math.max(site.height * 0.42, site.len * 0.038, 12);
      sp.scale.set(h * (cv.width / cv.height), h, 1);
      sp.position.copy(a).lerp(b, 0.5);
      sp.position.y += h * 0.55;   // 치수선 바로 위 — 부지를 가리지 않게
      sp.renderOrder = 999;
      g.add(sp);
    });

    return g;
  }

  // ---------- 하늘 · 안개 ----------
  // 배경이 검게 비면 3D가 잘려 보인다. 수직 그라데이션 하늘을 깔고
  // 같은 색 안개로 지면 끝을 감춰 부지가 지평선으로 이어지게 한다.
  function skyTexture(top, bottom) {
    const cv = document.createElement('canvas');
    cv.width = 2; cv.height = 256;
    const ctx = cv.getContext('2d');
    const grd = ctx.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, top);
    grd.addColorStop(1, bottom);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 2, 256);
    const tex = new THREE.CanvasTexture(cv);
    tex.needsUpdate = true;
    return tex;
  }

  function applyTheme(site) {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    const top = dark ? '#0b0e13' : '#b9c9de';
    const bottom = dark ? '#1c222b' : '#eef1f5';
    if (scene.background && scene.background.dispose) scene.background.dispose();
    scene.background = skyTexture(top, bottom);

    // 안개는 '지면 끝을 지평선에 녹이는' 용도다.
    // 시작 거리를 카메라 거리보다 가깝게 잡으면 부지 전체가 뿌옇게 떠서 원료색이 죽는다.
    // 부지가 다 들어오는 거리(fitDistance) 뒤쪽에서만 걸리도록 잡는다.
    const d = fitDistance(site);
    scene.fog = new THREE.Fog(col(bottom), d * 1.35, d * 3.2);
  }

  // ---------- 씬 ----------

  function ensureRenderer() {
    if (renderer) return true;
    THREE = global.THREE;
    if (!THREE) return false;

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    // ACES 필름 톤매핑 — 하이라이트가 날아가지 않아 형상과 재질이 살아난다
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.physicallyCorrectLights = false;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(42, 16 / 9, 1, 8000);

    // 조명 — 하늘/지면 반사광 + 태양(그림자)
    scene.add(new THREE.HemisphereLight(0x9fbada, 0x35322c, 0.34));
    const sun = new THREE.DirectionalLight(0xffeed2, 1.85);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.6;
    scene.add(sun);
    scene.userData.sun = sun;

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;   // 지면 아래로 못 내려간다
    return true;
  }

  function frameSun(site) {
    const sun = scene.userData.sun;
    const d = Math.max(site.len, site.depth);
    sun.position.set(-d * 0.62, d * 0.46, d * 0.52);
    const c = sun.shadow.camera;
    c.left = -d * 0.75; c.right = d * 0.75;
    c.top = d * 0.75; c.bottom = -d * 0.75;
    c.near = 1; c.far = d * 3;
    c.updateProjectionMatrix();
  }

  // 부지 전체가 화면에 담기는 거리 — 외접구를 시야각에 맞춘다
  function fitDistance(site) {
    const R = Math.hypot(site.len, site.depth) / 2;
    const vFov = camera.fov * Math.PI / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    // 여유 계수 — 축척 기준물과 외곽 설비까지 프레임에 들어오도록 잡는다
    return R / Math.sin(Math.min(vFov, hFov) / 2) * 1.3;
  }

  // 각 프리셋은 방향(단위벡터)만 정하고 거리는 부지 크기에서 계산한다
  const VIEWS = {
    bird:  { dir: [0.62, 0.52, 0.58], tY: 0.18 },
    front: { dir: [0.02, 0.20, 1.00], tY: 0.22 },
    eye:   { dir: [0.78, 0.14, 0.61], tY: 0.30, close: 0.30 },
    top:   { dir: [0.00, 1.00, 0.001], tY: 0 }
  };

  function setView(name, site) {
    const v = VIEWS[name] || VIEWS.bird;
    const d = fitDistance(site) * (v.close || 1);
    const n = Math.hypot(v.dir[0], v.dir[1], v.dir[2]);
    const ty = site.height * v.tY;
    camera.position.set(v.dir[0] / n * d, v.dir[1] / n * d + ty, v.dir[2] / n * d);
    controls.target.set(0, ty, 0);
    controls.minDistance = Math.max(20, site.height * 1.2);
    controls.maxDistance = d * 3;
    controls.update();
  }

  function resize() {
    if (!host || !renderer) return;
    const w = host.clientWidth || 800;
    const h = host.clientHeight || 480;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  // OS 접근성 설정에서 '동작 줄이기'를 켰으면 애니메이션을 재생하지 않는다
  function reducedMotion() {
    return typeof matchMedia !== 'undefined' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function loop() {
    if (!running) return;
    raf = global.requestAnimationFrame(loop);
    if (playing && !reducedMotion() && animList.length) {
      global.RSD.equip3d.stepAnimation(animList, (performance.now() - t0) / 1000);
    }
    controls.update();
    renderer.render(scene, camera);
  }

  function setPlaying(v) { playing = !!v; }
  function isPlaying() { return playing && !reducedMotion(); }

  // ---------- 원료별 표시 토글 ----------
  // 씬을 다시 세우지 않고 띠 그룹의 visible 만 바꾼다 — 즉시 반응한다
  function visibleFilter(keys, hidden) {
    return keys.filter(function (k) { return !hidden[k]; });
  }

  function applyHidden() {
    if (!siteGroup) return;
    siteGroup.children.forEach(function (g) {
      const k = g.userData && g.userData.materialKey;
      if (k) g.visible = !hiddenMaterials[k];
    });
  }

  function setVisible(materialKey, on) {
    if (on) delete hiddenMaterials[materialKey];
    else hiddenMaterials[materialKey] = true;
    applyHidden();
  }

  let lastSite = null;

  // 컨테이너에 캔버스를 붙이고 씬을 다시 세운다.
  // 탭을 오가며 innerHTML 이 갈리므로 렌더러는 재사용하고 캔버스만 다시 붙인다.
  function mount(container, state, result, view) {
    if (!ensureRenderer()) {
      container.innerHTML = '<div class="dwg3d-fail">3D 렌더러를 시작할 수 없습니다. ' +
        '브라우저가 WebGL을 지원하는지 확인해 주세요.</div>';
      return;
    }
    host = container;
    container.appendChild(renderer.domElement);
    resize();                       // 카메라 aspect 를 먼저 맞춰야 시야 계산이 맞는다
    const site = buildSite(state, result);
    lastSite = site;
    frameSun(site);
    setView(view || 'bird', site);
    applyTheme(site);
    if (!t0) t0 = performance.now();
    if (!running) { running = true; loop(); }
  }

  function unmount() {
    running = false;
    if (raf) global.cancelAnimationFrame(raf);
    raf = 0;
  }

  function applyView(name) {
    if (lastSite && controls) setView(name, lastSite);
  }

  function refreshTheme() { if (scene && lastSite) applyTheme(lastSite); }

  const api = {
    mount: mount, unmount: unmount, resize: resize, applyView: applyView,
    refreshTheme: refreshTheme, VIEWS: Object.keys(VIEWS),
    setPlaying: setPlaying, isPlaying: isPlaying,
    setVisible: setVisible, visibleFilter: visibleFilter,
    dimSpec: dimSpec
  };
  global.RSD = global.RSD || {};
  global.RSD.draw3d = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
