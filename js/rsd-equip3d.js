(function (global) {
  // 하역설비 3D 형상 + 물류 애니메이션
  //
  // 좌표계는 rsd-draw3d 와 동일하다 (X = 길이방향, Y = 높이, Z = 폭방향).
  // 움직이는 부재에는 userData.anim 에 운동 사양을 달아 두고,
  // 씬은 매 프레임 그 목록만 훑어 갱신한다 — 형상 코드와 애니메이션 로직이 섞이지 않는다.

  let THREE = null;
  function use(t) { THREE = t; }
  function col(hex) { return new THREE.Color(hex).convertSRGBToLinear(); }

  function box(w, h, d, mat) { return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); }
  function cyl(r, h, mat, seg) {
    return new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg || 20), mat);
  }
  function shade(o) { o.castShadow = true; o.receiveShadow = true; return o; }

  // ---------- 야드: Stacker / Reclaimer / Stacker-Reclaimer ----------
  //
  // 참조 사진 기준 실루엣:
  //   레일 대차 → A 프레임 마스트 → 마스트 정상에서 붐으로 내려오는 인장 케이블 2줄
  //   붐 끝에 대형 버킷휠(림 + 스포크 + 버킷), 반대편에 카운터붐 + 웨이트
  //   마스트 옆 운전실, 붐 상부 통로·난간(노랑)
  //
  // 붐은 +Z(야드) 를 향한다. facing = -1 이면 반대편 야드를 향하도록 180° 돌린다.
  function makeYardMachine(o) {
    const g = new THREE.Group();
    const mat = o.mat, accent = o.accentMat, rail = o.railMat || mat;
    const boomLen = o.boomLen, mastH = o.mastH, wheelR = o.wheelR;
    const hasWheel = (o.type === 'reclaimer' || o.type === 'sr');
    const hasChute = (o.type === 'stacker' || o.type === 'sr');
    const yellow = o.yellowMat || accent;

    // 주행 대차 + 차륜
    const bogie = shade(box(16, 2.4, o.railSpan + 5, mat));
    bogie.position.y = 1.2;
    g.add(bogie);
    [-o.railSpan / 2 - 1, o.railSpan / 2 + 1].forEach(function (z) {
      [-6, -2, 2, 6].forEach(function (x) {
        const w = cyl(1.2, 1.2, rail, 12);
        w.rotation.x = Math.PI / 2;
        w.position.set(x, 1.2, z);
        g.add(shade(w));
      });
    });

    // 회전 상부 — 붐·마스트·카운터가 통째로 슬루한다
    const slew = new THREE.Group();
    slew.position.y = 2.4;
    slew.rotation.y = (o.facing === -1) ? Math.PI : 0;
    slew.userData.anim = {
      kind: 'slew', axis: 'y',
      base: (o.facing === -1) ? Math.PI : 0, amp: 0.30, period: 23
    };
    g.add(slew);

    const turn = shade(cyl(3.6, 2.2, mat, 18));
    turn.position.y = 1.1;
    slew.add(turn);

    // A 프레임 마스트 — 두 다리가 정상에서 만난다
    const apex = mastH + 2.2;
    [-2.6, 2.6].forEach(function (zOff) {
      const legLen = Math.hypot(mastH, zOff * 2);
      const leg = shade(box(2.0, legLen, 1.6, mat));
      leg.position.set(0, 2.2 + mastH / 2, zOff);
      leg.rotation.x = Math.atan2(zOff * 2, mastH) * -1;
      slew.add(leg);
    });
    const apexBlock = shade(box(2.4, 2.0, 3.0, mat));
    apexBlock.position.y = apex;
    slew.add(apexBlock);

    // 붐 — 야드 쪽으로 뻗으며 아래로 기운다
    const boom = new THREE.Group();
    boom.position.y = 2.2 + mastH * 0.42;
    boom.rotation.x = 0.20;
    slew.add(boom);

    const beam = shade(box(3.0, 2.0, boomLen, mat));
    beam.position.z = boomLen / 2;
    boom.add(beam);
    const chord = shade(box(1.4, 1.1, boomLen * 0.94, mat));
    chord.position.set(0, 2.9, boomLen * 0.47);
    boom.add(chord);
    for (let i = 1; i <= 5; i++) {
      const tie = shade(box(0.8, 3.4, 0.8, mat));
      tie.position.set(0, 1.5, boomLen * (i / 6));
      boom.add(tie);
    }
    // 붐 통로·난간 (노랑) — 참조 사진의 가장 눈에 띄는 요소
    [-1.7, 1.7].forEach(function (xOff) {
      const rl = shade(box(0.35, 0.35, boomLen * 0.92, yellow));
      rl.position.set(xOff, 3.4, boomLen * 0.46);
      boom.add(rl);
      const deck = shade(box(0.9, 0.25, boomLen * 0.92, yellow));
      deck.position.set(xOff, 2.2, boomLen * 0.46);
      boom.add(deck);
    });

    // 인장 케이블 — 마스트 정상에서 붐 중간·끝으로
    [0.55, 0.95].forEach(function (t) {
      const zEnd = boomLen * t, yEnd = boom.position.y - Math.sin(0.20) * zEnd + 1.5;
      const dz = zEnd, dy = apex - yEnd;
      const len = Math.hypot(dz, dy);
      const cable = shade(box(0.3, len, 0.3, rail));
      cable.position.set(0, (apex + yEnd) / 2, dz / 2);
      cable.rotation.x = Math.atan2(dz, dy);
      slew.add(cable);
    });

    // 카운터붐 + 웨이트
    const cLen = boomLen * 0.38;
    const cBoom = shade(box(2.4, 1.8, cLen, mat));
    cBoom.position.set(0, 2.2 + mastH * 0.42, -cLen / 2);
    slew.add(cBoom);
    const cw = shade(box(6, 5, 5, mat));
    cw.position.set(0, 2.2 + mastH * 0.42 - 1.2, -cLen);
    slew.add(cw);

    // 운전실 — 마스트 옆
    const cab = shade(box(3.0, 2.8, 3.0, yellow));
    cab.position.set(3.4, 2.2 + mastH * 0.55, 2.0);
    slew.add(cab);

    // 버킷휠 — 붐 끝. 야드 쪽을 향해 파고든다.
    if (hasWheel) {
      const hub = new THREE.Group();
      hub.position.set(0, -2.0, boomLen);
      hub.userData.anim = { kind: 'spin', axis: 'x', speed: 1.1 };
      boom.add(hub);

      const rim = shade(new THREE.Mesh(
        new THREE.TorusGeometry(wheelR, wheelR * 0.13, 8, 22), mat));
      rim.rotation.y = Math.PI / 2;
      hub.add(rim);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const bucket = shade(box(2.4, wheelR * 0.34, wheelR * 0.34, mat));
        bucket.position.set(0, Math.cos(a) * wheelR, Math.sin(a) * wheelR);
        bucket.rotation.x = -a;
        hub.add(bucket);
        const spoke = shade(box(0.5, wheelR, 0.5, mat));
        spoke.position.set(0, Math.cos(a) * wheelR / 2, Math.sin(a) * wheelR / 2);
        spoke.rotation.x = -a;
        hub.add(spoke);
      }
      // 휠 가림막
      const guard = shade(new THREE.Mesh(
        new THREE.CylinderGeometry(wheelR * 1.15, wheelR * 1.15, 1.0, 20, 1, true,
          Math.PI * 0.15, Math.PI * 1.1), mat));
      guard.rotation.z = Math.PI / 2;
      guard.position.set(-1.6, -2.0, boomLen);
      boom.add(guard);
    }

    // 적치 슈트 + 낙하하는 원료 — 적치 중임이 보이게
    if (hasChute) {
      const chute = shade(new THREE.Mesh(
        new THREE.CylinderGeometry(1.6, 2.8, 5.0, 12), mat));
      chute.position.set(0, -3.2, boomLen * (hasWheel ? 0.80 : 0.95));
      boom.add(chute);
      if (o.oreMat) {
        // 슈트에서 파일로 떨어지는 원료 — 흐름 애니메이션으로 표현
        const dropLen = Math.max(6, o.dropHeight || 10);
        for (let i = 0; i < 5; i++) {
          const chunk = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), o.oreMat);
          chunk.position.set(0, -6, boomLen * (hasWheel ? 0.80 : 0.95));
          chunk.userData.anim = {
            kind: 'flow', axis: 'y', len: dropLen, speed: 9,
            start: (dropLen / 5) * i
          };
          boom.add(chunk);
        }
      }
    }

    return g;
  }

  // ---------- Tripper ----------
  //
  // 참조 사진 기준 구성:
  //   메인 컨베이어 위를 주행하는 대차(바퀴 4개) 위에 경사 프레임이 서고,
  //   벨트가 그 경사를 타고 올라가 상부 벤드 풀리를 돌아 내려온다.
  //   정점 아래 디스차지 후드로 원료가 좌(우)로 떨어진다.
  //   측면에 파란 구동 모터, 반대편에 케이블 릴.
  // twoWay 면 좌우 양쪽 후드 (Shed 중앙 옹벽용).
  function makeTripper(o) {
    const g = new THREE.Group();
    const mat = o.mat, w = o.width, h = o.height;
    const accent = o.accentMat || mat;
    const motor = o.motorMat || accent;
    const L = w * 1.5;                 // 주행방향 길이

    // 주행 대차 프레임 + 바퀴 4개
    const frame = shade(box(L, 1.6, w + 2.4, mat));
    frame.position.y = 1.4;
    g.add(frame);
    [-L * 0.36, L * 0.36].forEach(function (x) {
      [-(w / 2 + 1.0), w / 2 + 1.0].forEach(function (z) {
        const wheel = cyl(1.3, 1.1, accent, 12);
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(x, 1.3, z);
        g.add(shade(wheel));
        const hubc = cyl(0.4, 1.3, mat, 8);
        hubc.rotation.x = Math.PI / 2;
        hubc.position.set(x, 1.3, z);
        g.add(hubc);
      });
    });

    // 경사 프레임 — 벨트를 정점까지 들어올린다 (참조 사진의 핵심 실루엣)
    const rampLen = Math.hypot(L * 0.46, h * 0.78);
    [-1, 1].forEach(function (sgn) {
      const ramp = shade(box(rampLen, 1.0, w * 0.9, mat));
      ramp.position.set(sgn * L * 0.23, h * 0.42 + 1.4, 0);
      ramp.rotation.z = sgn * -Math.atan2(h * 0.78, L * 0.46);
      g.add(ramp);
      // 경사 벨트 위 캐리어 아이들러
      for (let i = 1; i <= 4; i++) {
        const t = i / 5;
        const ix = sgn * L * 0.46 * (1 - t);
        const iy = 1.4 + h * 0.78 * t;
        const idl = cyl(0.55, w * 0.82, accent, 8);
        idl.rotation.x = Math.PI / 2;
        idl.position.set(ix, iy, 0);
        g.add(shade(idl));
      }
    });

    // 정점 벤트 풀리 + 상부 하우징
    const pulley = cyl(1.9, w * 0.85, accent, 18);
    pulley.rotation.x = Math.PI / 2;
    pulley.position.set(0, h + 1.4, 0);
    pulley.userData.anim = { kind: 'spin', axis: 'z', speed: 2.0 };
    g.add(shade(pulley));

    const house = shade(box(L * 0.34, h * 0.30, w * 0.92, mat));
    house.position.set(0, h + h * 0.22 + 1.4, 0);
    g.add(house);
    // 하우징 지지 기둥
    [-L * 0.14, L * 0.14].forEach(function (x) {
      const col2 = shade(box(1.0, h * 0.9, 1.0, mat));
      col2.position.set(x, h * 0.5 + 1.4, w * 0.42);
      g.add(col2);
    });

    // 구동 모터 (파랑) + 기어박스
    const mtr = shade(cyl(1.5, 3.2, motor, 14));
    mtr.rotation.z = Math.PI / 2;
    mtr.position.set(-L * 0.12, h * 0.34 + 1.4, w * 0.44);
    g.add(mtr);
    const gear = shade(box(2.6, 2.4, 2.2, mat));
    gear.position.set(-L * 0.12 + 2.6, h * 0.34 + 1.4, w * 0.44);
    g.add(gear);

    // 케이블 릴
    const reelHub = new THREE.Group();
    reelHub.position.set(L * 0.30, h * 0.42 + 1.4, -w * 0.44);
    reelHub.userData.anim = { kind: 'spin', axis: 'z', speed: 0.4 };
    g.add(reelHub);
    const reel = cyl(2.6, 0.7, accent, 20);
    reel.rotation.x = Math.PI / 2;
    reelHub.add(shade(reel));
    for (let i = 0; i < 8; i++) {
      const sp = shade(box(0.35, 4.8, 0.35, mat));
      sp.rotation.z = (i / 8) * Math.PI * 2;
      reelHub.add(sp);
    }

    // 디스차지 후드 — 정점 아래에서 옆으로 벌어져 원료를 떨군다
    const sides = o.twoWay ? [-1, 1] : [1];
    sides.forEach(function (sgn) {
      const hood = shade(new THREE.Mesh(
        new THREE.CylinderGeometry(1.8, 3.4, h * 0.55, 10), mat));
      hood.position.set(0, h * 0.72, sgn * (w * 0.40));
      hood.rotation.x = sgn * -0.42;
      g.add(hood);
      // 후드 하단 배출구
      const lip = shade(box(w * 0.3, 0.8, 2.4, accent));
      lip.position.set(0, h * 0.46, sgn * (w * 0.56));
      g.add(lip);

      if (o.oreMat) {
        const dropLen = Math.max(6, o.dropHeight || 9);
        for (let i = 0; i < 5; i++) {
          const chunk = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), o.oreMat);
          chunk.position.set(0, 0, sgn * (w * 0.58));
          chunk.userData.anim = {
            kind: 'flow', axis: 'y', len: dropLen, speed: 8, start: (dropLen / 5) * i
          };
          g.add(chunk);
        }
      }
    });

    return g;
  }

  // ---------- Semi Portal Reclaimer (Shed) ----------
  //
  // 참조 사진 기준 실루엣:
  //   옹벽 상부 레일 + 지면 레일 두 높이에 걸쳐 서는 **반**포털
  //   (양쪽 다 지면이면 그냥 포털이다 — 한쪽이 벽 위에 올라앉아 '반' 이 붙는다)
  //   상부 수평 박스거더 → 그 아래 행거로 매달린 경사 스크레이퍼 체인 붐
  //   붐은 원료 개방측 빗변을 따라 내려가 하단 구동헤드에서 불출 B/C 로 떨군다
  //   구동헤드 옆 운전실, 붐 위 통로·난간(노랑)
  //
  // 좌표: −z = 옹벽측(높은 쪽), +z = 개방측(지면 레일). 붐은 능선에서 개방측 끝으로 내려간다.
  function makeSPR(o) {
    const g = new THREE.Group();
    const mat = o.mat, accent = o.accentMat;
    const yellow = o.yellowMat || accent;
    const Lb = o.Lb, La = o.La, h1 = o.h1;
    const span = Lb + La;
    const zWall = -span / 2;            // 옹벽측 레일
    const zRidge = zWall + Lb;          // 능선 (적치 최고점)
    const zToe = span / 2;              // 개방측 파일 끝 = 지면 레일
    const wallTop = o.wallTop;
    const bridgeY = Math.max(wallTop, h1) + 3.5;
    const slopeAngle = Math.atan2(h1, La);
    const slopeLen = Math.sqrt(La * La + h1 * h1);
    const w = o.width || 3.6;           // 기계 폭 (주행방향)

    // --- 주행 대차: 지면 레일(개방측) ---
    const bogie = shade(box(w + 1.6, 1.8, 3.0, mat));
    bogie.position.set(0, 0.9, zToe);
    g.add(bogie);
    [-w / 2, w / 2].forEach(function (x) {
      const wh = cyl(0.9, 0.7, o.railMat || mat, 12);
      wh.rotation.z = Math.PI / 2;
      wh.position.set(x, 0.9, zToe);
      g.add(wh);
    });
    // --- 주행 대차: 옹벽 상부 레일 (반포털의 '반') ---
    const bogie2 = shade(box(w + 0.8, 1.4, 2.4, mat));
    bogie2.position.set(0, wallTop + 0.7, zWall);
    g.add(bogie2);

    // --- 포털 다리 ---
    // 지면측은 브리지까지 통으로 올라가고, 옹벽측은 벽 위에서 짧게 받친다
    const legH = bridgeY - 1.8;
    const leg = shade(box(w, legH, 2.4, mat));
    leg.position.set(0, 1.8 + legH / 2, zToe);
    g.add(leg);
    const leg2H = bridgeY - wallTop - 1.4;
    if (leg2H > 0.5) {
      const leg2 = shade(box(w * 0.85, leg2H, 2.0, mat));
      leg2.position.set(0, wallTop + 1.4 + leg2H / 2, zWall);
      g.add(leg2);
    }

    // --- 상부 수평 박스거더 ---
    const bridge = shade(box(w * 0.8, 1.8, span, mat));
    bridge.position.set(0, bridgeY, 0);
    g.add(bridge);

    // --- 경사 스크레이퍼 붐 ---
    // 능선 위에서 시작해 개방측 끝까지. 원료면보다 살짝 띄워 얹는다.
    const boom = new THREE.Group();
    boom.position.set(0, h1 + 1.4, zRidge);
    boom.rotation.x = slopeAngle;       // +z 로 갈수록 내려간다
    g.add(boom);

    // 경사 박스거더 — 사진에서 가장 눈에 띄는 부재. 얇은 트러스가 아니라 두툼한 상자다.
    const girder = shade(box(w * 0.9, 2.4, slopeLen, mat));
    girder.position.set(0, 0, slopeLen / 2);
    boom.add(girder);
    // 스크레이퍼가 긁는 하부 트로프 (거더 아래로 살짝 내민다)
    const trough = shade(box(w * 1.1, 0.5, slopeLen, mat));
    trough.position.set(0, -1.45, slopeLen / 2);
    boom.add(trough);
    // 통로·난간 — 붐 옆으로 길게 이어지는 노란 난간
    [-w * 0.62, w * 0.62].forEach(function (x) {
      const rl = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, slopeLen), yellow);
      rl.position.set(x, 1.9, slopeLen / 2);
      boom.add(rl);
      const deck = shade(box(0.5, 0.16, slopeLen, mat));
      deck.position.set(x, 1.2, slopeLen / 2);
      boom.add(deck);
      // 난간 지주
      const nP = Math.max(3, Math.round(slopeLen / 6));
      for (let i = 0; i <= nP; i++) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.7, 0.12), yellow);
        post.position.set(x, 1.55, (slopeLen / nP) * i);
        boom.add(post);
      }
    });

    // 체인 스크레이퍼 날 — 트로프를 따라 아래로 흘러 원료를 끌어내린다
    const chain = new THREE.Group();
    chain.position.set(0, -1.05, slopeLen / 2);
    boom.add(chain);
    const nBlade = Math.max(6, Math.round(slopeLen / 4));
    for (let i = 0; i < nBlade; i++) {
      const bl = shade(box(w * 1.15, 0.7, 0.5, accent));
      bl.userData.anim = {
        kind: 'flow', axis: 'z', len: slopeLen,
        speed: 5, start: (slopeLen / nBlade) * i
      };
      chain.add(bl);
    }

    // --- 행거 --- 상부 거더에서 붐을 매단다 (사진의 거더 아래 촘촘한 기둥들)
    const nHang = Math.max(2, Math.round(La / 8));
    for (let i = 1; i <= nHang; i++) {
      const u = i / (nHang + 1);
      const z = zRidge + La * u;
      const yTop = bridgeY - 0.9;
      const yBot = h1 * (1 - u) + 2.8;
      const hh = yTop - yBot;
      if (hh <= 0.5) continue;
      const rod = shade(box(0.5, hh, 0.5, mat));
      rod.position.set(0, yBot + hh / 2, z);
      g.add(rod);
    }

    // --- 구동 헤드 --- 붐 하단. 긁어 내린 원료를 여기서 불출 B/C 로 떨군다.
    // 붐 끝은 (y = 1.4, z = zToe) 로 떨어진다 — 지면 레일 바로 위다.
    // 대형 구동 드럼 (사진의 빨간 드럼) 은 그 끝에 노출돼 있다.
    const drum = cyl(1.7, w * 1.4, accent, 18);
    drum.rotation.z = Math.PI / 2;
    drum.position.set(0, 2.0, zToe - 0.8);
    drum.userData.anim = { kind: 'spin', axis: 'x', speed: 1.4 };
    g.add(drum);
    // 구동 하우스 — 다리 바깥쪽에 붙는다 (원료 안에 묻히면 보이지 않는다)
    const head = shade(box(w * 1.15, 4.2, 4.0, mat));
    head.position.set(0, 4.6, zToe + 2.2);
    g.add(head);
    // 슈트 — 헤드에서 하부 불출 B/C 로 떨어지는 통로
    const chute = shade(box(w * 0.7, 3.4, 1.8, mat));
    chute.position.set(0, 1.7, zToe + 4.2);
    g.add(chute);

    // --- 운전실 --- 구동헤드 옆
    const cab = shade(box(2.6, 3.0, 3.0, o.cabMat || accent));
    cab.position.set(w * 0.6 + 1.4, 5.2, zToe + 2.2);
    g.add(cab);

    return g;
  }

  // ---------- Silo 하부 배출부 (RDM) ----------
  //
  // RDM 은 Silo 내부 설비라 외부에서는 보이지 않는다.
  // 하부 배출 하우스와 회전 로터로 위치를 표현한다.
  function makeSiloDischarge(o) {
    const g = new THREE.Group();
    const mat = o.mat;
    const house = shade(box(o.dia * 0.42, 5.5, o.dia * 0.42, mat));
    house.position.y = 2.75;
    g.add(house);
    // RDM 로터
    const rotor = new THREE.Group();
    rotor.position.y = 1.2;
    rotor.userData.anim = { kind: 'spin', axis: 'y', speed: 0.5 };
    g.add(rotor);
    for (let i = 0; i < 3; i++) {
      const arm = shade(box(o.dia * 0.5, 0.5, 1.2, o.accentMat));
      arm.rotation.y = (i / 3) * Math.PI * 2;
      rotor.add(arm);
    }
    return g;
  }

  // ---------- Shed 셀 1개의 원료 더미 ----------
  //
  // 단면은 비대칭이다 — 중앙 옹벽에 기대어 능선까지 올라갔다가 개방측으로 흘러내린다.
  //   옹벽면(wallHeight) → 능선(h1, 옹벽에서 Lb) → 개방측 끝(0, 능선에서 La)
  // 이 단면을 셀 길이만큼 밀어내면 실제 적치 형상이 된다.
  function makeShedPile(o) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(0, o.wallHeight);
    shape.lineTo(o.Lb, o.h1);
    shape.lineTo(o.Lb + o.La, 0);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: o.len, bevelEnabled: false });
    geo.rotateY(Math.PI / 2);          // 압출축 Z → X (건물 길이방향)
    const m = new THREE.Mesh(geo, o.mat);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  // ---------- 벨트 컨베이어 갤러리 ----------
  function makeGallery(o) {
    const g = new THREE.Group();
    const mat = o.mat, len = o.len, w = o.width || 3.2, h = o.height || 5.0;

    const deck = shade(box(len, 0.7, w, mat));
    deck.position.y = h;
    g.add(deck);
    // 커버 — 지붕형
    const cover = shade(new THREE.Mesh(
      new THREE.CylinderGeometry(w * 0.62, w * 0.62, len, 10, 1, false, 0, Math.PI), mat));
    cover.rotation.z = Math.PI / 2;
    cover.position.y = h + 0.35;
    g.add(cover);
    // 지지대
    const n = Math.max(2, Math.round(len / 42));
    for (let i = 0; i <= n; i++) {
      const p = shade(box(0.9, h, 0.9, mat));
      p.position.set(-len / 2 + (len / n) * i, h / 2, 0);
      g.add(p);
    }
    return g;
  }

  // ---------- 벨트 위 원료 흐름 ----------
  function makeFlow(o) {
    const g = new THREE.Group();
    const n = o.count || Math.max(6, Math.round(o.len / 60));
    for (let i = 0; i < n; i++) {
      const chunk = new THREE.Mesh(
        new THREE.BoxGeometry(6, 0.7, o.width || 2.0), o.mat);
      chunk.position.y = o.y || 0;
      chunk.userData.anim = {
        kind: 'flow', axis: 'x', len: o.len,
        speed: o.speed || 26, start: (o.len / n) * i
      };
      g.add(chunk);
    }
    return g;
  }

  // ---------- 애니메이션 ----------

  // 하위 트리에서 userData.anim 이 달린 객체를 모은다
  function collectAnimated(root) {
    const list = [];
    root.traverse(function (o) {
      if (o.userData && o.userData.anim) list.push({ obj: o, anim: o.userData.anim });
    });
    return list;
  }

  function stepAnimation(list, t) {
    for (let i = 0; i < list.length; i++) {
      const o = list[i].obj, a = list[i].anim;
      if (a.kind === 'travel') {
        // 사인 왕복 — 양 끝에서 자연스럽게 감속한다
        const u = Math.sin((t / a.period + (a.phase || 0)) * Math.PI * 2);
        o.position[a.axis] = a.center + u * a.range / 2;
      } else if (a.kind === 'spin') {
        o.rotation[a.axis] = t * a.speed;
      } else if (a.kind === 'slew') {
        o.rotation[a.axis] = (a.base || 0) + Math.sin(t / a.period * Math.PI * 2) * a.amp;
      } else if (a.kind === 'flow') {
        const d = (a.start + t * a.speed) % a.len;
        o.position[a.axis] = -a.len / 2 + d;
      }
    }
  }

  const api = {
    use: use, col: col,
    makeYardMachine: makeYardMachine, makeTripper: makeTripper, makeSPR: makeSPR,
    makeSiloDischarge: makeSiloDischarge, makeGallery: makeGallery, makeFlow: makeFlow,
    makeShedPile: makeShedPile,
    collectAnimated: collectAnimated, stepAnimation: stepAnimation
  };
  global.RSD = global.RSD || {};
  global.RSD.equip3d = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
