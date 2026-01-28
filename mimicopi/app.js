// ピアノ耳コピ補助ツール - メインスクリプト
(() => {
    // 基本音階（C から B）をシャープ表記で固定
    const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    // 白鍵・黒鍵の判定（白鍵なら true）
    const IS_WHITE = [true, false, true, false, true, true, false, true, false, true, false, true];

    // メジャー・ナチュラルマイナーの半音構成（ルートを0とする）
    const MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11];
    const NATURAL_MINOR_INTERVALS = [0, 2, 3, 5, 7, 8, 10];

    // DOM
    const keyboardEl = document.getElementById('keyboard');
    const noteLabelsEl = document.getElementById('noteLabels');
    const majorListEl = document.getElementById('majorList');
    const minorListEl = document.getElementById('minorList');
    const resetBtn = document.getElementById('resetBtn');
    const ledRow = document.getElementById('ledRow');

    // state
    // selected indexes (0..11)
    let selected = new Set();

    // scales: {type:'major'|'minor', root: idx, name:string, notes: number[]}
    const scales = [];

    function buildScales() {
        for (let root = 0; root < 12; root++) {
            const majorNotes = MAJOR_INTERVALS.map(i => (root + i) % 12);
            const minorNotes = NATURAL_MINOR_INTERVALS.map(i => (root + i) % 12);
            scales.push({
                type: 'major',
                root,
                name: `${NOTE_NAMES[root]}`,
                notes: majorNotes
            });
            scales.push({
                type: 'minor',
                root,
                name: `${NOTE_NAMES[root]}m`,
                notes: minorNotes
            });
        }
    }

    // UI: white keys count 7, black keys 5. We'll render white keys sequentially and position blacks with computed centers
    const WHITE_ORDER = [0, 2, 4, 5, 7, 9, 11]; // indices for white keys left-to-right
    const BLACK_ORDER = [1, 3, 6, 8, 10];     // indices for black keys

    function createKeyboard() {
        // clear
        keyboardEl.innerHTML = '';
        noteLabelsEl.innerHTML = '';
        ledRow.innerHTML = '';

        // white keys
        WHITE_ORDER.forEach((noteIdx, i) => {
            const w = document.createElement('div');
            w.className = 'white-key';
            w.dataset.note = noteIdx;
            // dot for ON indicator
            const dot = document.createElement('span');
            dot.className = 'dot';
            w.appendChild(dot);
            // label inside key (optional)
            w.addEventListener('click', onKeyClick);
            w.addEventListener('touchstart', onKeyTouch, { passive: true });
            keyboardEl.appendChild(w);

            // note label underneath
            const label = document.createElement('div');
            label.className = 'label';
            label.textContent = NOTE_NAMES[noteIdx];
            noteLabelsEl.appendChild(label);
        });

        // --- black keys (absolute positioned) ---
        // 黒鍵は、実際にレンダリングされた白鍵の中心位置を取り、その左右の白鍵中心の中点を黒鍵中心にする
        // これにより CSS のボーダーやパディングがあっても正確に中央に配置される
        // まず白鍵要素とキーボード幅を取得
        const whiteElems = Array.from(keyboardEl.querySelectorAll('.white-key'));
        const kbRect = keyboardEl.getBoundingClientRect();
        // 領域がまだ描画されていない可能性があるため、強制的に reflow（getBoundingClientRect がそれを行う）
        const whiteCenters = whiteElems.map(w => {
            const r = w.getBoundingClientRect();
            // 白鍵の中心を、キーボード左端からの相対ピクセルで保持
            return (r.left - kbRect.left) + (r.width / 2);
        });

        // ヘルパー: BLACK_ORDER の各黒鍵に対して左右の白鍵インデックスを求め、中点のパーセンテージを返す
        function leftPercentForBlackByCenters(noteIdx) {
            // 右側の最初の白鍵の WHITE_ORDER 内の位置を見つける
            let rightWhitePos = WHITE_ORDER.findIndex(n => n > noteIdx);
            if (rightWhitePos === -1) {
                // 右側の白鍵が見つからない（通常は起きない）、最後の白鍵の右に置くのではなく最後の間に置く
                rightWhitePos = whiteCenters.length - 1;
            }
            const leftWhitePos = Math.max(0, rightWhitePos - 1);
            // 隣接する白鍵の中心位置を取り中点を計算
            const leftC = whiteCenters[leftWhitePos];
            const rightC = whiteCenters[rightWhitePos];
            const center = (leftC + rightC) / 2;
            // キーボード全幅に対するパーセンテージに変換
            const percent = (center / kbRect.width) * 100;
            return percent;
        }

        // 生成
        BLACK_ORDER.forEach((noteIdx) => {
            const b = document.createElement('div');
            b.className = 'black-key';
            b.dataset.note = noteIdx;

            // 中心に合わせて left% をセット
            const leftPct = leftPercentForBlackByCenters(noteIdx);
            b.style.left = leftPct.toFixed(4) + '%';

            const dot = document.createElement('span');
            dot.className = 'dot';
            b.appendChild(dot);
            b.addEventListener('click', onKeyClick);
            b.addEventListener('touchstart', onKeyTouch, { passive: true });
            keyboardEl.appendChild(b);
        });

        // LED row indicators (optional small dots that mirror selected count)
        for (let i = 0; i < 7; i++) {
            const l = document.createElement('div');
            l.className = 'led';
            ledRow.appendChild(l);
        }

        refreshKeyUI();
    }

    // Toggle selection
    function onKeyClick(e) {
        const note = Number(this.dataset.note);
        toggleNote(note);
    }
    function onKeyTouch(e) {
        // touch handler: same as click
        const note = Number(this.dataset.note);
        toggleNote(note);
    }

    function toggleNote(note) {
        if (selected.has(note)) selected.delete(note);
        else selected.add(note);
        refreshKeyUI();
        updateScaleLists();
    }

    function setNotes(noteArray) {
        selected = new Set(noteArray);
        refreshKeyUI();
        updateScaleLists();
    }

    function resetAll() {
        selected.clear();
        refreshKeyUI();
        updateScaleLists();
    }

    function refreshKeyUI() {
        // update white keys
        const whiteKeys = keyboardEl.querySelectorAll('.white-key');
        whiteKeys.forEach(k => {
            const note = Number(k.dataset.note);
            if (selected.has(note)) k.classList.add('on');
            else k.classList.remove('on');
        });
        // update black keys
        const blackKeys = keyboardEl.querySelectorAll('.black-key');
        blackKeys.forEach(k => {
            const note = Number(k.dataset.note);
            if (selected.has(note)) k.classList.add('on');
            else k.classList.remove('on');
        });

        // update led indicators: light as many as selected (capped to 7)
        const leds = Array.from(ledRow.children);
        const selCount = selected.size;
        leds.forEach((l, i) => {
            if (i < selCount) l.classList.add('on');
            else l.classList.remove('on');
        });
    }

    // スケールのフィルタリング：選択された全ての音がスケールに含まれるものを表示
    function filterScales() {
        if (selected.size === 0) {
            // 何も選択されていない場合は全てのスケールを返す（分離して表示）
            const majors = scales.filter(s => s.type === 'major');
            const minors = scales.filter(s => s.type === 'minor');
            return { majors, minors };
        }
        const selArr = Array.from(selected);
        const majors = scales.filter(s => s.type === 'major' && selArr.every(n => s.notes.includes(n)));
        const minors = scales.filter(s => s.type === 'minor' && selArr.every(n => s.notes.includes(n)));
        return { majors, minors };
    }

    function updateScaleLists() {
        const { majors, minors } = filterScales();
        renderScaleList(majorListEl, majors);
        renderScaleList(minorListEl, minors);
    }

    function renderScaleList(container, list) {
        container.innerHTML = '';
        // If none matched, show placeholder
        if (list.length === 0) {
            const p = document.createElement('div');
            p.style.color = '#999';
            p.style.fontSize = '0.9rem';
            p.textContent = '該当なし';
            container.appendChild(p);
            return;
        }
        list.forEach(s => {
            const btn = document.createElement('button');
            btn.className = 'scale-btn';
            // 読みやすくするため "C" -> "C major", "Cm" -> "C minor"
            btn.textContent = (s.type === 'major') ? `${s.name} (Major)` : `${s.name} (Minor)`;
            btn.title = s.notes.map(i => NOTE_NAMES[i]).join(' ');
            btn.addEventListener('click', () => {
                // クリックで現在ONをリセットし、スケールの構成音をONにする
                setNotes(s.notes);
            });
            container.appendChild(btn);
        });
    }

    // 初期化
    function init() {
        buildScales();
        createKeyboard();
        updateScaleLists();

        resetBtn.addEventListener('click', () => {
            resetAll();
        });

        // keyboard resize: keep black keys positioned correctly - they use percent so fine.
        window.addEventListener('resize', () => {
            // nothing required; percent-based positions remain valid.
        }, { passive: true });
    }

    // run
    init();

})();