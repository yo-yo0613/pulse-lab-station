# 《See How You Speak》（看你怎麼說話）
## 專案企劃書與技術規格書 (PRD)

* **專案名稱**：《See How You Speak》 (看你怎麼說話 / 聲音視覺化沉浸互動展)
* **核心提案組員**：林妤安、柯佩岑、林科余（【共評一】沉浸式體驗組 Top 1，總分 95.00 分）
* **專案主題界定**：本規格書**100% 專注於「聲音視覺化 / 語音模仿動態字體 / 沉浸互動展演」**，與同課堂另一組由劉芯妤等同學發表之「慧眼（HuiYan）」穿戴式手套控制器提案完全區隔，請評圖與展示時明確辨識。
* **技術底座**：繼承《PULSE LAB》工業級 Web 前端架構 (React 19 / TypeScript / Vite / Tailwind CSS / PWA / 本地聲學 DNA 編碼)
* **架構決策原則**：42 大工程 A/B 對決 **100% 全數鎖定「方案 B」最佳實踐**
* **文件版本**：v2.6.0 (Audio Demo TTS & Dual-Track Master PRD)
* **最後更新**：2026 年 10 月 22 日

---

## 🎯 一、 專案核心論述與設計概念 (Creative Statement)

### 1.1 創作背景與核心痛點
傳統字幕僅能呈現「**說了什麼（What was said）**」，但語言中超過 70% 的情感感染力來自於「**怎麼說的（How it was spoken）**」——包含音量大小、音調高低、咬字急促、頓挫與情緒張力。

本作《See How You Speak》旨在打造一種**讓聲音被看見的動態視覺語言（Visualizing Sound & Kinetic Typography）**。透過使用者親自對麥克風進行聲音模仿，系統即時擷取音訊多維特徵，將無形的聲音能量轉化為具象的字體變形、3D 音波流體與發光粒子，讓體驗者看見自己聲音的形狀與張力。

### 1.2 預期目標與展演場景
* **展演場景**：新媒體藝術互動展、商場快閃語音互動體驗亭 (Interactive Kiosk)、數位設計期末成果展。
* **硬體設定**：直立式 9:16 觸控一體機或高解析度展示螢幕 + 指向性降噪麥克風。
* **行動端延伸**：使用者體驗完畢後，透過手機掃描螢幕專屬 QR Code，即可在手機瀏覽器帶走個人「聲音視覺認證卡片」，並一鍵分享至 Instagram / Threads。

### 1.3 林妤安核心語感訴求與 4 大動態映射維度（錄音原案解析）
根據提案人林妤安語音紀錄（`林妤安的重點 10-13.m4a`），字幕不應僅是「放大縮小」，而必須如同音符般傳遞真實說話語感：

| 語感維度 | 使用者真實語音特徵 | 動態字幕（Kinetic Typography）物理反饋 | 底層 Web 映射參數 |
| :--- | :--- | :--- | :--- |
| **① 語調平淡 vs. 高低起伏** | 講話音調平淡 vs. 聲調抑揚頓挫（Pitch 波動） | 聲音平淡時文字呈水平基準線（Baseline）；聲音走高時文字向上浮動飄起，聲音走低時向下沉墜微頓，形成如樂譜般的**上下波浪或折線起伏**。 | `pitchNormalized` 經動態基準線差值計算，直通 `--v-y-offset` (`translateY: -28px ~ +28px`)。 |
| **② 拉長音（Sustained Vowel）** | 發出綿延尾音（例如：「你好～～」的「好」） | 字體不再只是垂直變大，而是**滑順地橫向「拉長、延伸」**，字距與字寬隨持音時間動態展延。 | `sustainedDuration` 累加器映射至 `--v-width` (`font-stretch`: 75% -> 150%) 與 `--v-letter-spacing`。 |
| **③ 音量強弱（Volume / Amplitude）** | 大聲嘶吼 vs. 輕柔細語 | 音量越大，字體迅速膨脹加粗；音量變小，字體俐落縮細變小。 | `smoothVolume` 經 Sigmoid 飽和箝位後直通 `--v-weight` (`font-weight`: 100 -> 900)。 |
| **④ 短音與快語速（Staccato & Tempo）** | 講話急促、連珠炮短促發音 | 呈現短小精悍、俐落縮放的乾脆彈性節奏，收尾極快不拖泥帶水；若越講越大聲且持續延伸，則字體累積膨脹。 | 脈衝檢測自適應縮短彈簧阻尼 Decay 時間至 35ms，實現瞬態咬字回彈。 |

---

## 🔄 二、 5 階段核心體驗閉環 (User Experience Journey)

```mermaid
flowchart TD
    IDLE["1. LANDING 待機導引<br/>動態聲學雷達掃描 + 麥克風底噪環境校準 + 休眠守門狗"] --> PROMPT["2. PROMPT_VIDEO 典範示範<br/>播放 3~5 秒具強烈語氣的情緒台詞影片 + 暫切麥克風防迴音"]
    PROMPT --> RECORD["3. RECORDING 語音模仿與即時視覺化<br/>使用者開口模仿，逐字字體變形與 3D 音波流體即時爆發"]
    RECORD --> SCORE["4. SCORE_ANALYSIS 相似度演算法比對<br/>非線性 DTW 彈性對齊比對語調起伏與情緒還原度"]
    SCORE --> EXPORT["5. EXPORT_CARD 成果生成與掃碼 (主打 0 外網依賴)<br/>首選「聲學 DNA 參數化 QR Code」秒繪海報 + Cloudinary 雙保險"]
    EXPORT --> IDLE
```

1. **`LANDING`（待機探索）**：
   * 螢幕呈現呼吸律動的 3D 聲波核心與賽博網格背景。
   * 支援休眠守門狗（Audio Snooze Watchdog），無人 60 秒進入節能低溫待機。
   * 點擊大按鈕瞬間解鎖 AudioContext 並執行 300ms 環境底噪自動取樣（Noise Gate Calibration）。

2. **`PROMPT_VIDEO`（原聲情緒示範）**：
   * 播放 3~5 秒經典影視或動畫中極具語氣張力的台詞（如：暴怒咆哮、極度委屈、興奮尖叫、冷酷低沉）。
   * 同步呈現原聲的「黃金聲波輪廓線」與字幕，建立模仿目標。
   * 播放期間切斷麥克風通道，杜絕展場喇叭迴音自激。

3. **`RECORDING`（即時動態字體與 3D 視覺渲染）**：
   * 體驗者對著麥克風複誦模仿台詞（定長 300 影格環形緩衝池記錄）。
   * **字體即時變形**：
     * 音量越大 ➔ 字體 `font-weight` (100 -> 900) 劇烈變粗。
     * 音高越高 ➔ 字體 `font-stretch` (75% -> 125%) 橫向擴張或拉高。
     * 振幅爆發 ➔ 伴隨色差故障特效 (Chromatic Aberration) 與文字震顫。
   * **3D 音波流體**：背景的三維液態球體隨聲波劇烈扭曲，發光粒子（Sparkles）隨說話節奏向外擴散。

4. **`SCORE_ANALYSIS`（語調相似度科學比對）**：
   * 系統透過動態時間規整（DTW）演算法，比對有效切片長度的聲音波形與原聲範本。
   * 綜合計算「音量能量曲線相似度 (60%)」與「音調高低走勢相似度 (40%)」。
   * 給予成就評級（如：`SSS 聲動大師`、`S 靈魂模仿者`、`A 能量超載`）與專屬評語。

5. **`EXPORT_CARD`（聲音卡片生成與掃碼帶走：主打 0 外網依賴雙保險）**：
   * **🥇 核心首選（展場/地下室 0 外網依賴亮點）**：**「URL Query 聲學 DNA 參數化編碼」**。大機台將體驗者的評級、分數、台詞代碼與特徵聲波數據（約 300 字元）直接編入極小點陣的動態 QR Code。**大機台完全不需連上外網**，民眾使用自己的手機（4G/5G 或快取）掃碼後，手機端極簡 Canvas 在 0.05 秒內純前端繪製出 1080x1920 高清無損海報，徹底杜絕展場無 WiFi 或訊號死角導致的卡死。
   * **🥈 輔助備案（聯網環境之高階存檔）**：在有穩定外網時，機台同步由離屏 Canvas 合成並於背景直傳 Cloudinary 雲端圖床提供直接圖片下載，達成「斷網高可用＋聯網高畫質」的工業級雙保險。

---

## 🏗️ 三、 《PULSE LAB》架構 1:1 移植對照表 (Architecture Migration)

| 系統層級 | 原本《PULSE LAB》實作 | 轉移至《See How You Speak》 | 升級說明 |
| :--- | :--- | :--- | :--- |
| **技術基底** | React 19 + TypeScript + Vite + Tailwind CSS | **React 19 + TypeScript + Vite + Tailwind CSS** | **100% 沿用**，具備完全離線 PWA 快取能力。 |
| **感測輸入** | WebCam 視訊 + MediaPipe 骨架追蹤 | **Web Audio API (`AudioContext`, `AnalyserNode`)** | **模組熱插拔**：毫秒級採樣人聲音量 (RMS) 與基頻 (F0)。 |
| **視覺呈現** | Canvas 2D 雙層 Float32Array 粒子物理池 | **CSS Variable Fonts + Three.js/R3F 免寫 Shader 方案** | **視覺轉換**：聲音即時驅動可變字體變形與液態材質。 |
| **數值評分** | 累積肢體動能評分與爆發瞬態判斷 | **一維 DTW (動態時間規整) 彈性對齊演算法** | **升級**：科學比對語氣波形相似度，兼顧娛樂性與容錯。 |
| **成果導出** | 1080x1920 海報合成 + Cloudinary 零拷貝管線 | **9:16 聲音視覺卡片合成 + Cloudinary 直傳** | **100% 沿用**：手機掃碼即享完整實拍與頻譜卡片。 |
| **展場防護** | Kiosk 事件監獄 + 喚醒鎖定 + 守門狗 | **Kiosk 監獄 + 自動底噪校準 (Noise Gate)** | **100% 沿用**：防展場誤觸、防長期待機音頻採樣率失鎖。 |

---

## ⚔️ 四、 42 大工業級展演 A/B 技術決策（全數鎖定方案 B）

在真實商場與展會實機環境中，工程團隊與架構評審必須面對 42 個致命的物理與架構選擇題，**本專案全數嚴格執行「方案 B」最佳實踐**：

### 🎨 組別一：渲染與視覺效能組

#### 【A/B 1】 音訊採樣驅動字體變形：`useState` 每秒 60 次更新 vs CSS 變數直通管線
* **方案 A（陷阱）**：每幀呼叫 `setMetrics({ volume, pitch })`，觸發 React 虛擬 DOM 每秒 60~120 次 Diffing，主線程卡死、字體嚴重丟幀 (Jank)。
* **方案 B（最佳實踐，100% 採用）**：**CSS Custom Properties 直通管線**。透過 `ref.style.setProperty('--v-weight', ...)` 寫入 DOM，交由瀏覽器 Compositor Thread 硬體加速，React 負擔為 0，穩跑 60fps！

#### 【A/B 3】 3D WebGL 視覺效能：全屏 R3F Postprocessing Bloom vs 自適應雙軌加算發光
* **方案 A（陷阱）**：引入全屏 R3F `<Bloom />`，多重 FBO 高斯模糊通道打爆展示機或手機 GPU 填滿率，幀率跌至 15fps。
* **方案 B（最佳實踐，100% 採用）**：**自適應雙軌視覺引擎**。大螢幕端開 R3F `<MeshDistortMaterial>` + 輕量 Bloom；手機端與弱卡自動降級為 **Canvas 2D 混合加算模式 (`ctx.globalCompositeOperation = 'lighter'`)**，以 5% GPU 開銷達成 95% 電影級光暈。

#### 【A/B 8】 TouchDesigner 影片與文字圖層合成：CSS 多圖層覆蓋 vs 單一畫布雙軌貼圖 (Video Texture)
* **方案 A（陷阱）**：在 HTML 堆疊 `<video>`、`<div typography>`、`<canvas>` 三層硬靠 `z-index` 與 `screen` 疊加，觸發 Compositor 跨層重拼與圖層撕裂 (Tearing)。
* **方案 B（最佳實踐，100% 採用）**：**雙軌共存與單一 WebGL/Canvas 上下文貼圖混色**。文字自帶 Canvas 特效，載入外部影片時以 VideoTexture 於單一上下文中混色輸出，確保 0 撕裂。

#### 【A/B 11】 動態文字發音反饋：整句同生同死 vs 逐音節分頻變形 (Per-Syllable Kinetic Typography)
* **方案 A（陷阱）**：整句台詞包在單一容器內同時放大縮小，字體像死板橡膠塊，失去語言抑揚頓挫與咬字跳躍感。
* **方案 B（最佳實踐，100% 採用）**：**逐音節分頻能量槽映射**。低頻元音驅動下壓擴張，高頻爆破音驅動字距震顫；每個音節標籤強制加入 `will-change: font-weight, transform; display: inline-block;` 獨立升格 GPU 圖層，0 次 Reflow。

---

### 🎙️ 組別二：音訊採樣與訊號處理組

#### 【A/B 2】 音高（Pitch）偵測演算法：頻域最高峰值 (FFT Peak) vs 時域自相關演算法 (Autocorrelation)
* **方案 A（陷阱）**：直接取 `getByteFrequencyData()` 最大振幅 Bin，被人類聲音倍頻與泛音干擾，音高數值在 100Hz 與 2000Hz 狂跳抽搐。
* **方案 B（最佳實踐，100% 採用）**：**時域歸一化自相關演算法 (Normalized Autocorrelation / YIN) + EMA 滑動平滑**。從時域波形計算重複週期，精準鎖定 85Hz~350Hz 人聲自然基頻，字體寬窄延展絲滑自然。

#### 【A/B 5】 展場環境雜音：靜態寫死門檻 vs 300ms 動態底噪自動校準 (Noise Gate)
* **方案 A（陷阱）**：寫死 `if (volume > 20)`，被展場 35~50dB 冷氣與人群嘈雜打穿，體驗者沒開口字體就已巨大變形。
* **方案 B（最佳實踐，100% 採用）**：**進場前 300ms 環境底噪自動校準**。採樣背景底噪 $N_{\text{ambient}}$ 並動態抬高門檻，低於底噪完全靜止，高於底噪展開動態範圍，反差強烈。

#### 【A/B 10】 示範音訊與波形時基同步：JS 計時器 vs 音訊晶片硬體時鐘 (`audioCtx.currentTime`)
* **方案 A（陷阱）**：使用 `setTimeout` / `performance.now()` 計時，受主線程事件循環干擾產生 30~150ms 漂移，導致波形時間軸基準錯位。
* **方案 B（最佳實踐，100% 採用）**：**聲卡 DAC 晶片硬體時鐘相對對齊**。錄音啟動時鎖定 `startTime = audioCtx.currentTime`，採樣點記錄為相對時間差 `elapsed = audioCtx.currentTime - startTime`，精度達 0.1ms。

#### 【A/B 13】 字體極限形變安全：線性無腦映射 vs 數學 Sigmoid 飽和箝位 (Clamped Sigmoid Mapping)
* **方案 A（陷阱）**：線性計算 `100 + vol * 10`，遇大吼吹氣音量破表時算得 `fontWeight: 1300`，字型頂點翻轉破面、字元黑塊破圖或換行破版。
* **方案 B（最佳實踐，100% 採用）**：**動態底噪偏移 Sigmoid 飽和箝位**。扣除底噪後帶入 S 型曲線 $1 / (1 + e^{-(vol_{eff} - 30)/12})$，邊界鎖定在配置區間 `{ minWeight: 100, maxWeight: 900 }`，大吼極限飽和且 100% 邊界安全。

---

### 💾 組別三：記憶體控制與展機長跑健康組

#### 【A/B 6】 音訊波形儲存：動態陣列 `push` vs 預分配定長環形緩衝池 (Circular Buffer)
* **方案 A（陷阱）**：每幀 `.push()` 觸發 V8 頻繁記憶體重分配與 GC Spike，連續玩 20 次後在第 4 秒錄音關鍵時刻瞬間凍結掉幀。
* **方案 B（最佳實踐，100% 採用）**：**預分配定長 Float32Array 環形緩衝池**。預先分配 300 槽位，指針覆寫，0 次記憶體重配置，0 GC 開銷，DTW 比對零拷貝。

#### 【A/B 7】 字體變形手感：原始波形直通 vs 非對稱彈簧阻尼濾波 (Attack-Decay Spring Model)
* **方案 A（陷阱）**：音量直通字體，被說話高頻摩擦音與爆破音帶動，文字瘋狂高頻抖動抽搐，體驗者眼花不適。
* **方案 B（最佳實踐，100% 採用）**：**非對稱彈簧阻尼濾波器 + Delta Time 補償**。Attack 迅猛膨脹 ($\tau \approx 16\text{ms}$) 保留爆發力，Decay 彈性衰減 ($\tau \approx 120\text{ms}$) 呈現水滴果凍回彈，兼具力量與流動感。

#### 【A/B 12】 展機 8 小時待機之音訊硬體健康：24 小時全開 vs 狀態機休眠守門狗 (Audio Snooze Watchdog)
* **方案 A（陷阱）**：無人待機時每秒 60 次不斷抓取麥克風計算 FFT，展示電腦過熱降頻，且長時間佔用音訊通道引發驅動緩衝溢位斷音。
* **方案 B（最佳實踐，100% 採用）**：**待機休眠與即時喚醒狀態機**。無人 60 秒將 `audioCtx.suspend()`，CPU 降至 1% 清涼待機；點擊螢幕瞬間 0.05 秒無縫喚醒。

---

### 🌐 組別四：評分比對與跨端雲端導出組

#### 【A/B 4】 模仿相似度計算：純音量差值比對 vs 一維動態時間規整 (DTW, Dynamic Time Warping)
* **方案 A（陷阱）**：兩陣列歐式距離相減，體驗者稍晚 0.2 秒發聲即判定為完全不相符扣成 0 分，帶來強烈挫折感。
* **方案 B（最佳實踐，100% 採用）**：**一維 DTW 彈性對齊演算法**。允許時間軸局部拉伸對齊，比對情緒曲線形態：$\text{Score} = (\text{DTW}_{\text{音量}} \times 0.6) + (\text{DTW}_{\text{音調}} \times 0.4)$，科學且富正向回饋。

#### 【A/B 9】 手機成果海報跨端呈現：手機端重新計算變形 vs 大機台離屏 Canvas 合成直出
* **方案 A（陷阱）**：手機掃碼後重新下載 5MB 可變字體並在手機重跑變形，弱網加載 8 秒，且舊款手機對 Variable Fonts 變形軸支援不全導致字型走樣。
* **方案 B（最佳實踐，100% 採用）**：**大機台單例 1080x1920 離屏合成 + Cloudinary 直傳**。大機台定格瞬間生成高清海報直傳雲端，手機端 0.3 秒即開即看大螢幕同款海報，100% 跨端無色差缺字。

---

### 🎭 組別五：聲音語感與極致 Kinetic Typography 動態組（林妤安原話深度落實）

#### 【A/B 14】 音高語調 Y 軸跳躍之基準線漂移：絕對音高映射 vs 個人化滑動動態基準線 (EMA Floating Baseline)
* **方案 A（陷阱）**：採用固定絕對頻率（例如以 200Hz 當 0 位移）。男低音（85~120Hz）講話時，所有文字永遠沉在畫面最底端；女高音或小孩（250~350Hz）講話時，文字永遠死死頂在天花板，完全喪失「個人語氣平淡 vs. 高低起伏」的相對變化。
* **方案 B（最佳實踐，100% 採用）**：**指數移動平均動態浮動基準線 (EMA Floating Baseline & Differential Y-Displacement)**。系統在體驗者發聲前 300ms 動態鎖定其個人平均基頻 $F_{0,\text{baseline}}$。只有當當前音調高於其個人平均時，文字才向上飄浮（$\Delta Y > 0$）；低於時向下微沉（$\Delta Y < 0$）；講話平淡時，差值接近 0，整排文字完美回歸水平 Baseline 平鋪！

#### 【A/B 15】 拉長音 (Sustained Vowel) 判定演算法：純時間長度計時器 vs 能量穩定度 + 音高變異數雙條件滑動窗口
* **方案 A（陷阱）**：只要講話持續超過 200ms 就無腦判定為拉長音。結果一般人講話稍微慢一點或連音時，文字就莫名其妙橫向暴長、擠壓變形，破壞正常語境。
* **方案 B（最佳實踐，100% 採用）**：**能量穩定度 + 音高變異數雙條件滑動窗口 (Pitch Variance < 8% + RMS Stability)**。真正的「拉長音（如：你好～～）」在聲學物理上具備「頻率極度穩定、振幅無急促衰減」之特徵。系統計算最近 12 影格（200ms）的音高標準差 $\sigma_{\text{pitch}}$ 與振幅方差，僅在 $\sigma_{\text{pitch}} < 8\%$ 且音量持續高於門檻時，才將 `sustainedDuration` 累加並漸進釋放至 `--v-width` (75% -> 150%) 與 `--v-letter-spacing`，實現極致自然的橫向綿延。

#### 【A/B 16】 快語速與短音 (Staccato) 物理阻尼模型：全域單一彈簧阻尼常數 vs 雙階自適應非對稱阻尼（快攻瞬收）
* **方案 A（陷阱）**：全域使用固定的長延遲 Decay（如 120ms）。當體驗者發出短促爆破音或機關槍式快語速（如「快跑！」、「住手！」）時，字體還沒縮小下一個音節就已經衝上來，導致所有字腫成一坨橡皮泥，無法體現「短小精悍、俐落縮放」。
* **方案 B（最佳實踐，100% 採用）**：**雙階自適應非對稱阻尼（Dual-Phase Adaptive Damper：快攻瞬收）**。檢測到音量脈衝上升沿陡峭（$\Delta \text{Vol} > 30$ 在 40ms 內）且緊隨快速中斷時，阻尼衰減時間常數 $\tau_{\text{decay}}$ 動態切換為極速 35ms；若檢測為持續音則平滑過渡至 140ms。短音短促俐落、長音飽滿回彈，完美呈現林妤安所要的咬字節奏感！

#### 【A/B 17】 逐字波浪延遲傳播 (Cascading Wave) 之渲染開銷：React 分離渲染 30 個獨立 DOM vs 單一 CSS 變數 + 索引延遲硬體級計算
* **方案 A（陷阱）**：在 React 或 JS `requestAnimationFrame` 迴圈中，針對台詞中 20~30 個文字個別計算正弦波位移並個別修改 `ref.style.transform`，每秒產生上千次 JS-DOM 橋接開銷，主線程嚴重掉幀。
* **方案 B（最佳實踐，100% 採用）**：**單一 CSS 變數 + 索引延遲硬體級計算 (`calc() & var(--char-index)`)**。JS 每一幀僅需向父容器注入單一全域波浪相位 `--wave-phase` 與音高震幅 `--wave-amp`。每個文字節點純靠純 CSS 計算：`transform: translateY(calc(sin(var(--wave-phase) + var(--char-index) * 0.45) * var(--wave-amp)));`，所有波形動畫由瀏覽器 GPU 複合器直接平行運算，JS 主線程負擔恆等於 0！

#### 【A/B 18】 可變字體橫向拉長 (Width/Stretch) 之版面擠壓重排：修改 `letter-spacing` / `width` vs GPU 複合圖層與水平中心縮放 (`scaleX`)
* **方案 A（陷阱）**：拉長音時直接用 CSS 變更 `letter-spacing` 或容器 `width`，觸發瀏覽器極昂貴的 Layout Reflow，整行文字不斷左右推擠抖動，旁邊的字瘋狂位移，引發嚴重視覺撕裂與掉幀。
* **方案 B（最佳實踐，100% 採用）**：**GPU 獨立圖層變換 (`transform: scaleX()`) + 可變字軸 `font-stretch` 槽位保護**。為每個字元建立固定彈性槽位，搭配 `will-change: transform; display: inline-block;` 升格為獨立合成圖層。拉長音時優先調用字體原生 `wdth` 變形軸，若字體不支援則無縫切換為 GPU `transform: scaleX(var(--v-width))` 局部拉伸，相鄰字元紋絲不動，0 次 Layout Reflow，穩跑 60fps！

---

### 📦 組別六：多媒體載入、硬體相容與字體註冊組 (A/B 19 ~ A/B 22)

#### 【A/B 19】 多段示範台詞與影片載入策略：單一頁面一次預載 (Eager Preload) vs 頁面按需流式加載 (Lazy Streaming)
* **方案 A（陷阱）**：頁面啟動時一次下載所有 3~5 段示範影片（~20MB），若展場或評圖現場 WiFi 訊號不穩，開場會卡在 Loading 畫面 10 秒以上，造成嚴重冷場。
* **方案 B（最佳實踐，100% 採用）**：**單一預設情境預載 + 異步背景預拉取 (Service Worker Background Fetch)**。初次啟動只載入 1 段預設台詞影片（~2MB）確保 0.3 秒極速開場；體驗者在 Step 1 閱讀說明與挑選時，系統於背景執行 Service Worker 默默預載其餘情境選項，達成「零等待無感切換」。

#### 【A/B 20】 麥克風多通道音量輸入相容性：單聲道強轉 (Mono Downmix) vs 自動雙通道陣列 (Stereo Array)
* **方案 A（陷阱）**：直接讀取 `audioCtx.createMediaStreamSource(stream)` 預設 channel，若展場使用的是專業立體聲聲卡或雙頭指向性麥克風，常遇到只有右聲道帶有訊號、左聲道為空，導致演算法誤判為靜音，採樣數值全為 `0`。
* **方案 B（最佳實踐，100% 採用）**：**Web Audio Channel Merger & Downmix 管線**。透過 `ChannelMergerNode` 或 `ChannelSplitterNode` 將所有實體輸入通道訊號強轉並混合為單聲道（Mono Downmix：$(L+R)/2$ 或 $\max(L, R)$），無論連接筆電內建麥克風、USB 指向麥或專業錄音介面，均能 100% 穩定擷取音量與音高。

#### 【A/B 21】 評分相似度之挫折感控制：絕對分數直出 vs 娛樂性正規化動態曲面 (Gamified Non-linear Scaling)
* **方案 A（陷阱）**：DTW 演算法算出 42 分就直接硬生生顯示 42 分，民眾或評審模仿不夠像會產生強烈挫折感，覺得裝置壞了，不敢掃碼帶走海報或分享社群。
* **方案 B（最佳實踐，100% 採用）**：**S 型保底曲線 + 娛樂性稱號動態映射 (Base Floor 60 + Dynamic Scale)**。將 DTW 計算結果帶入 $\text{FinalScore} = 60 + (\text{RawDTW} \times 0.38)$，最低給予 60 分保底；並根據「音量爆發力」與「音高走勢」給予特殊稱號（如：`SSS 賽博暴音王`、`S 靈魂聲優`、`A 能量超載`），大幅激發體驗者的分享慾望與拍照意願！

#### 【A/B 22】 美術與技術的字體替換架構：硬編碼綁定特定字體 vs 配置化可變字體動態註冊器 (Font Registry Architecture)
* **方案 A（陷阱）**：把 CSS 變數直接綁死在某一款特定的 `.woff2` 字體名稱上，若林妤安中途想換 3 款不同風格的中文字體，程式碼多個元件需要同步人工改寫。
* **方案 B（最佳實踐，100% 採用）**：**Font Registry 配置化動態註冊器**。在 JSON 配置檔中註冊字體名稱與其支援的變形軸（`wght`, `wdth`, `slnt`），林妤安只要丟入新字體檔並修改 JSON 配置，系統即可自動動態注入 `@font-face` 並無縫套用，工程端 0 程式碼更動！

---

### 🔌 組別七：離線韌性、無網路環境與展機自癒組 (A/B 23 ~ A/B 27)

#### 【A/B 23】 無網路環境下的大機台運行架構：Node.js 本機伺服器 vs PWA Service Worker 完全離線快取
* **方案 A（陷阱）**：依賴開終端機跑本機 Node.js server，一旦終端機被工讀生誤關或背景程式崩潰，整個展演直接報 `500 Server Error` 甚至無法開機重連。
* **方案 B（最佳實踐，100% 採用）**：**PWA Service Worker 完全離線快取**。首次開啟後瀏覽器自動將所有程式碼、可變字體、影片快取至本機。大機台本體（聲音採樣、字體變形、Canvas 音波流體、DTW 比對）100% 跑在電腦本地端，拔掉網路線重開機照樣 60fps 穩定運作！

#### 【A/B 24】 無外網環境下的 QR Code 成果傳輸：自建本機 WiFi 熱點 vs 輕量化聲學參數 QR Code (URL Query DNA Encoding)
* **方案 A（陷阱）**：展場沒外網就逼民眾連機台開的無網 WiFi 熱點。民眾手機偵測到「此網路無網際網路連線」會自動跳出警告或強制切斷，90% 體驗者因挫折而放棄拿海報。
* **方案 B（最佳實踐，100% 採用）**：**輕量化聲學簽名參數化 QR Code (URL Query DNA Encoding) 雙保險**。有網路時走 Cloudinary 雲端圖床；斷網時自動無縫降級為「純字串參數編碼」（~300 字元，含分數、稱號、台詞與聲波特徵陣列）。民眾用自己的 4G/5G 掃碼，手機端 Canvas 在 0.05 秒內秒繪出同款 1080x1920 高清海報，大機台 0 外網依賴！

#### 【A/B 25】 無網路下手機端字體缺字與渲染：外網即時下載 10MB 字體 vs 系統現代黑體 + 內嵌關鍵字形向量 (0 外部依賴)
* **方案 A（陷阱）**：手機掃碼後若展場收訊不佳，頁面試圖連 Google Fonts 下載 10MB 字型，轉圈 20 秒後字體退化成新細明體破圖。
* **方案 B（最佳實踐，100% 採用）**：**手機分享頁離線獨立渲染引擎**。優先調用 iOS/Android 原生極簡黑體（PingFang SC / Roboto / System Sans），並內嵌關鍵主題字型向量輪廓，手機端 0 外聯下載依賴，即使在地下室 1 格訊號下也能秒開秒繪！

#### 【A/B 26】 展場斷網時的維護與參數微調：隨身碟重新編譯覆蓋 vs 內建「離線維護者暗樁抽屜 (Maintainer Tap Jail)」
* **方案 A（陷阱）**：現場若覺得麥克風太靈敏或想換字體，因斷網無法 Git Pull，必須拿隨身碟手忙腳亂重新 Build 程式。
* **方案 B（最佳實踐，100% 採用）**：**維護者 5 次連續點擊暗樁 (Maintainer Tap Jail) + 本地 LocalStorage 參數覆蓋**。即使斷網，現場在螢幕左上角連點 5 次即可喚出隱藏調試抽屜，即時滑動拉桿調節麥克風閾值、切換字體與情緒參數，改完立即生效。

#### 【A/B 27】 展機意外斷電或跳電後的自動自癒：人工桌面找捷徑 vs Chrome Kiosk Mode 開機全螢幕自啟動 (`--kiosk --incognito`)
* **方案 A（陷阱）**：打掃阿姨踢掉延長線跳電，展機重開後停在 Windows/Mac 桌面，現場工讀生不知道點哪一個檔案。
* **方案 B（最佳實踐，100% 採用）**：**Chrome `--kiosk --incognito` 捷徑開機自啟動**。開機 5 秒自動全螢幕啟動展示頁，無網址列、無邊框、防觸控退出，直接進入 `LANDING` 聲學待機狀態，具備展場級自癒能力。

### 🎮 組別八：全模態輸入與零接觸聲控展演組 (A/B 28 ~ A/B 32)

#### 【A/B 28】 全模態輸入架構聚合：多重分散事件監聽 vs 集中式全模態事件匯流排 (Omni-Input Action Bus)
* **方案 A（陷阱）**：鍵盤、觸控螢幕、聲控閾值、簡報筆、手機遙控在不同組件內各自寫 `onClick`、`addEventListener('keydown')`、`onVoiceTrigger`，造成狀態跳轉競態衝突、多重重複觸發、邏輯碎片化且極難調試。
* **方案 B（最佳實踐，100% 採用）**：**集中式全模態事件匯流排 (Omni-Input Action Bus)**。底層將「觸控螢幕點擊、實體簡報筆/鍵盤、聲控 VAD 關鍵詞、手機遠端遙控」統一抽象化為 4 大純粹語意動作：`NEXT_STEP`、`START_RECORDING`、`FORCE_SUBMIT`、`RESTART`。由單一有限狀態機 (FSM) 統一消費，任一輸入源隨插即用且永遠互斥安全！

#### 【A/B 29】 零碰觸聲控跳轉的觸發演算法：純音量峰值門檻 vs 雙重 VAD 語音活動檢測 + 150ms 連續能量窗口
* **方案 A（陷阱）**：只用音量閾值（如 `volume > 35`）當作「使用者開口說話」的跳轉訊號。展場路人拍手、關門聲、重物落地引發的瞬間脈衝波，導致系統在無人時莫名其妙自走跳頁空轉。
* **方案 B（最佳實踐，100% 採用）**：**雙重 VAD (Voice Activity Detection) + 150ms 人聲能量滑動窗口**。除音量突破底噪閾值外，基頻需落在正常人聲基頻區間（85Hz ~ 350Hz），且必須連續維持能量超過 150ms，完全過濾非人聲之瞬間拍掌聲或腳步撞擊聲，達成真正的「零接觸人聲即開跑」。

#### 【A/B 30】 展場無外網環境下的手機遠端遙控傳輸：雲端 WebSocket 中繼 vs 本地 Peer-to-Peer 廣播 / 零外網 Local Host Web Remote
* **方案 A（陷阱）**：手機當遙控器走公有雲 WebSocket 伺服器，展場地下室斷網或延遲高達 300ms，按鍵反應遲緩甚至斷線報錯，令展演當場開天窗。
* **方案 B（最佳實踐，100% 採用）**：**本地局域網輕量廣播 (Local Host Web Remote) / WebRTC DataChannel 本地直連**。機台螢幕生成含本地 Session Token 之配對 QR Code，策展人員或使用者手機連入同區網（或自建熱點），以極致輕量化 JSON 指令在 16ms 內發送操控 Action，無外網依然秒點秒響應！

#### 【A/B 31】 多輸入併發競態防護 (Race Condition)：自由競爭跳轉 vs FSM 狀態鎖定互斥閥門 (Transition Mutex with 350ms Debounce)
* **方案 A（陷阱）**：未加輸入互斥鎖，熱心觀眾手指點擊觸控螢幕的同時，導覽員剛好按下簡報筆，觸發雙重跳轉直接跳過錄音倒數進入評分崩潰頁。
* **方案 B（最佳實踐，100% 採用）**：**FSM 狀態遷移互斥鎖 (Transition Mutex) + 350ms 防抖時間戳**。狀態機在執行任何狀態遷移時，瞬間上鎖 350ms，期間所有多餘的觸碰、按鍵或語音脈衝一律作為無效事件安靜丟棄，徹底杜絕多重輸入造成的狀態紊亂。

#### 【A/B 32】 零碰觸與公共展演的待機自癒：永久停留海報頁 vs 階梯式無人自動退回機制 (Tiered Watchdog Timer)
* **方案 A（陷阱）**：前一位觀眾體驗完畢走人，畫面永久定格在海報成果頁。後續路過民眾不知道這是一台互動裝置，以為是故障海報看板不敢碰觸。
* **方案 B（最佳實踐，100% 採用）**：**階梯式看門狗無人自動退回機制 (Tiered Watchdog Timer)**。在成果評分頁若 10 秒無操作自動進入海報頁；海報頁若 20 秒無人點擊或掃碼，自動啟動 5 秒倒數並無縫退回 `LANDING` 迎賓待命狀態，同時自動重新校準現場底噪，達成 7x24 小時無人值守自動運轉。

### 🎨 組別九：動態字體語感物理、原音重現與成果格式組 (A/B 33 ~ A/B 37)

#### 【A/B 33】 動態成果輸出格式：前端純 JS 轉 GIF vs 輕量活體動態海報 (Living Web Poster) + 原生硬體加速錄影雙模
* **方案 A（陷阱）**：在前端瀏覽器使用傳統 JS GIF 庫（如 `gifshot`/`omggif`）將 90 幀 1080x1920 畫面逐幀進行調色盤量化壓縮成 .gif。展場筆電 CPU 瞬間飆至 100%，機台卡死轉圈 12~15 秒，導出檔案高達 18MB，且 GIF 僅支援 256 色，發光漸層嚴重破色，展場地下室弱網直接超時下載失敗。
* **方案 B（最佳實踐，100% 採用）**：**輕量活體動態海報 (Living Web Poster) + 原生硬體加速錄製雙模**。手機掃碼後以原生 Canvas 根據聲波參數即時驅動「活體聲波流動海報」，0 秒加載；同時提供 0.05 秒高清靜態 PNG 導出，以及調用瀏覽器原生硬體加速 `MediaRecorder`（H.264/WebM，1677 萬全彩且體積僅 1.2MB），兼顧極致流暢與社群分享！

#### 【A/B 34】 音量大小之字體物理視覺映射：單一字重變粗 vs 雙維度物理縮放 (Font Scale + Weight Dual-Mapping)
* **方案 A（陷阱）**：音量僅單純映射到 `font-weight` (100~900)。使用者用力大喊時字體僅微微加粗，視覺上沒有「震撼爆發」的體積膨脹感；輕聲細語時也沒有退縮感，缺乏情緒張力。
* **方案 B（最佳實踐，100% 採用）**：**雙維度飽和物理縮放 (Font Scale + Weight Dual-Mapping with Safe Clamping)**。音量透過 Sigmoid 曲線同時映射 `font-weight` (100 -> 900) 與 `transform: scale(0.85 -> 1.75)`。嘶吼時文字瞬間放大炸裂並伴隨色差光暈，細語時字體微縮內斂，具備極致的情緒體積感，並掛載自動邊界防破版約束。

#### 【A/B 35】 語感長短音物理延展：固定字距寬度 vs 持音累加器 (Sustained Vowel Extender) 與瞬態咬字回彈 (Staccato Snap)
* **方案 A（陷阱）**：不論發長音還是短促音，字形比例死板不變，完全失去說話語感的真實反饋。
* **方案 B（最佳實踐，100% 採用）**：**持音累加器 (Sustained Extender) + 瞬態咬字回彈 (Staccato Snap)**。當人聲持續持音超過 150ms，`sustainedDuration` 累加驅動 `font-stretch` (75% -> 150%) 與字距 `letter-spacing` 橫向滑順拉長，文字像橡皮筋般延展；當檢測到急速爆發但持音 < 80ms 的短音時，立即啟動 35ms 阻尼回彈與緊湊窄體，乾脆俐落。

#### 【A/B 36】 體驗者原音重現回放架構：即錄即丟 (Zero Audio Persist) vs 記憶體切片緩衝池 (In-Memory Audio Blob Replay)
* **方案 A（陷阱）**：錄音僅分析 FFT 頻譜數值，未保留音訊波形二進位檔案。結算與海報頁無法回放聲音，體驗者無法聽到自己剛才滑稽或震撼的模仿原音，喪失 80% 的現場傳播笑點。
* **方案 B（最佳實踐，100% 採用）**：**記憶體切片音訊緩衝池 (In-Memory Audio Blob Replay)**。在錄音 5 秒期間，前端 `MediaRecorder` 同步將 PCM/WebM 串流保留在記憶體中，結算頁與海報頁提供「▶️ 聆聽我的原音」與「原聲 vs 模仿 AB 對比」按鈕，0 外網依賴本機秒播！

#### 【A/B 37】 手機掃碼帶走個人原音：純文字參數放棄聲音 vs 輕量 60KB Opus 雲端同步 + 斷網無縫降級
* **方案 A（陷阱）**：試圖將整段 80KB 音訊轉成 Base64 硬塞進 QR Code，導致 QR Code 點陣密密麻麻如雜訊圖，手機相機 100% 無法識別掃描。
* **方案 B（最佳實踐，100% 採用）**：**輕量 60KB Opus 雲端背景同步 + 斷網無縫降級雙保險**。有外網時，機台背景 0.3 秒上傳這段 60KB 語音至雲端，手機端附帶音訊播放器可一鍵存檔；展場斷網時，自動降級為聲學 DNA 參數海報，機台本體依然能無限次回放聲音，兩端皆萬無一失！

### 🔊 組別十：示範語音聲學導引、TTS 語音合成與原聲資材熱插拔組 (A/B 38 ~ A/B 42)

#### 【A/B 38】 示範發音雙軌引擎選型：純外部 MP3 依賴 vs 離線 Web Speech API TTS + MP3 雙軌保險 (Dual-Track Audio Prompt)
* **方案 A（陷阱）**：純依賴美術組手動剪輯提供 MP3。一旦美術夥伴未及時交稿、檔名打錯或路徑 404，示範頁面瞬間變成「啞巴無聲動畫」，體驗者看著台詞完全不知道該如何發音。
* **方案 B（最佳實踐，100% 採用）**：**雙軌熱插拔自癒音訊架構 (Dual-Track Audio Prompt)**。系統優先檢測 `/public/audio/prompts/` 內是否有該情境之實體原聲 MP3；若有則播放極具戲劇張力之電影/動漫原聲；若無則 0 秒自動無縫降級為瀏覽器原生 `window.speechSynthesis`（Web Speech TTS），依據情境動態調整 Pitch (0.6~1.4) 與 Rate (0.8~1.3)，達成 100% 斷網離線保底發聲！

#### 【A/B 39】 示範語音播放時之自動播放策略（Autoplay Policy）：頁面加載立即強制播放 vs 手勢轉場解鎖音訊上下文後接續發聲
* **方案 A（陷阱）**：從 `LANDING` 進入 `PROMPT_VIDEO` 時試圖直接呼叫 `audio.play()` 或 `synth.speak()`，因未與使用者手勢直接綁定，被現代瀏覽器安全性原則（Autoplay Policy）判定為未經授權靜音並報出 `DOMException: play() failed` 致命錯誤。
* **方案 B（最佳實踐，100% 採用）**：**手勢轉場授權透傳架構 (Gesture-Unlocked Audio Handoff)**。在 `LANDING` 迎賓頁使用者點擊螢幕或開口觸發進入的瞬間，同步解鎖 AudioContext 與 SpeechSynthesis 的音訊管道；切換至示範頁時直接沿用已授權之管道播放示範語音，0 警告、0 靜默。

#### 【A/B 40】 示範語音與視覺波形跳動之時間軸同步：假定固定長度動畫 vs 音訊播放即時頻譜分析 (Live Audio Analyser Sync)
* **方案 A（陷阱）**：底部的示範波形長條圖用 CSS `keyframes` 寫死跑 3.3 秒固定進度。若台詞較長（如仿生人台詞需唸 4.8 秒），畫面進度條已經跑完且顯示「COMPLETED」，喇叭裡的語音卻還在唸，音畫嚴重脫節。
* **方案 B（最佳實踐，100% 採用）**：**真實音訊時長綁定與 Analyser 節點實時頻譜同步 (Real-time Audio Analyser Node & Duration Binding)**。若播放實體 MP3，將其接入 Web Audio Analyser 即時萃取真實頻譜高度；若走 TTS，透過 `utterance.onboundary` 與真實時長動態縮放進度條，達成 100% 聲畫物理同步。

#### 【A/B 41】 示範聲音播放時之展場麥克風狀態控制：全開監聽 vs 雙重硬性靜音閘門 (Hardware Gain Zero & VAD Lockout)
* **方案 A（陷阱）**：在機台大聲播放示範語音時，麥克風通道依舊保持活躍。機台外接喇叭播放的原音直接衝入麥克風，底噪自適應算法被破壞，甚至誤觸發「使用者已開口」而提前中斷示範。
* **方案 B（最佳實踐，100% 採用）**：**雙重硬性靜音閘門 (Dual Acoustic Gate Lock)**。在示範語音啟動的第 0 毫秒，麥克風硬體 GainNode 降為 0，且 VAD 語音活動檢測完全鎖死；直到語音播畢、螢幕顯示「換你模仿」後，才平滑解鎖收音，徹底物理切斷迴音自激。

#### 【A/B 42】 多次切換情境之音訊中斷處理：疊音混雜 vs 單一語音控制器互斥中止 (`speechSynthesis.cancel() & audio.pause()`)
* **方案 A（陷阱）**：體驗者在示範頁快速連續點選不同的情境 Tab，前一個情境的示範語音未停止，新情境又開播，多個聲音重疊如菜市場，系統音訊通道崩潰。
* **方案 B（最佳實踐，100% 採用）**：**單一語音播放控制器互斥閥 (Exclusive Audio Controller)**。切換情境或離開頁面時，強制執行 `speechSynthesis.cancel()` 與 `audio.pause()`、`audio.currentTime = 0`，永遠保持單一聲音通道乾淨。

---

## 🧩 五、 核心模組架構與介面規格 (Module Architecture)

### 5.1 音訊採樣 Hook (`src/hooks/useAudioAnalyzer.ts`)
```ts
export interface AudioMetrics {
  rawVolume: number;         // 0 ~ 100 未濾波音量
  smoothVolume: number;      // 彈簧阻尼平滑音量
  pitchHz: number;           // 85 ~ 350Hz 基頻
  pitchNormalized: number;    // 0 ~ 1 歸一化音高
  frequencyData: Uint8Array; // 頻譜資料 (低/中/高頻分頻)
  isVoiceActive: boolean;    // 是否突破環境底噪
}
```
* **時鐘基準 (A/B 10)**：錄音倒數嚴格採用音訊晶片硬體時鐘 `audioCtx.currentTime`，與系統 Event Loop 解耦，精度達 0.1ms。
* **原音切片 (A/B 36)**：錄音期間掛載原生 `MediaRecorder`，結束時產出 `audioBlob` 與 Object URL，供結算與海報頁現場重放與 AB 盲測對比。
* **防迴音閘門 (7.22 & 7.29)**：提供 `muteInput(boolean)`，示範影片播放及原音回放期間強制麥克風 GainNode 歸零，防喇叭自激。

### 5.2 動態字體組件 (`src/components/KineticTypography.tsx`)
* **字體選型**：可變字體（支援 `wght` 100~900, `wdth` 75%~125%），打包在 `public/fonts/`。
* **圖層隔離**：逐字/音節 `<span />` 套用 `will-change: font-weight, transform; display: inline-block;`。
* **變形映射**：
  * `font-weight`: 經 Sigmoid 飽和箝位後直接注入 `--v-weight` (100 ~ 900)。
  * `font-stretch`: `--v-width` (75% ~ 150%，持音橫向拉長)。
  * `scale`: 音量物理縮放 `transform: scale(0.85 ~ 1.75)`，大聲嘶吼炸裂膨脹，細語微縮。
  * `letter-spacing`: 大音量向外爆發擴散 (0px -> 8px)。
  * `text-shadow`: 音量爆發時觸發洋紅/青色色差光暈 (Chromatic Aberration)。
  * **防撞幾何防護 (7.28)**：外層容器設置 `max-width: 90%; word-break: break-word;`，字數較多時自動自適應換行，杜絕海報兩側破版。

### 5.3 3D 音波流體背景 (`src/components/VoiceVisualizer3D.tsx`)
* `<MeshDistortMaterial distort={volume * 0.015} speed={pitch * 2} color="#00F0FF" />`
* `<Sparkles count={400} scale={volume * 0.1} color="#FF007A" />`
* `<Bloom intensity={volume > 70 ? 2.5 : 0.8} />`

### 5.4 跨領域協同設計：動態影音資材預留介面 (`src/components/DynamicMediaOverlay.tsx`)
* **支援格式**：WebM/MP4 Alpha 透明影片、TouchDesigner 黑底影片 (`mix-blend-mode: screen`)、透明 GIF、Lottie 動畫。
* **動態驅動**：`smoothVolume` 映射至 `playbackRate` (0.5x ~ 2.0x) 與 `opacity`。

### 5.5 聲波對齊評分引擎 (`src/utils/audioDTW.ts`)
* 輸入有效切片長度 `volumeBuffer.subarray(0, recordedFrames)`。
* **空陣列與超短錄音防禦**：若有效長度 `< 15` 影格（約不足 250ms），強制攔截禁止進入二維矩陣運算，直接給予防呆提示與基礎保底評分，杜絕 `IndexOutOfBounds` 崩潰。
* 輸出 0~100 分綜合還原度評級與關鍵幀評價。

---

## 🎨 六、 跨領域美術協作友善機制：動態資材預留架構 (Media Slot Architecture)

### 6.1 設計哲學：Creative Technologist 協同開發思維
傳統互動專案中最常見的團隊衝突，是工程師強制要求美術組配合代碼限制（如「TouchDesigner 特效寫不進網頁，只能用工程師預設的粒子」）。
本作採用**「預留資材介面（Media Slot Architecture）」**，在系統架構中全面開放外接資材插槽，達成**「美術組風格 100% 自由、工程端 100% 穩定保底」**的雙贏局面。

### 6.2 Web 承接 TouchDesigner / AE 資材的三大極速管線
1. **TouchDesigner 導出 WebM Alpha 透明影片**：Movie File Out TOP 導出帶 Alpha 值影片，前端以 `<video>` 播放並由 Web Audio 控制。
2. **黑底影片 + CSS 混合模式（0 效能損耗秒融圖）**：黑底特效影片套用 `mix-blend-mode: screen`，黑色背景立即全透明消失，自然疊加在字體與 3D 空間。
3. **Three.js 影片動態貼圖 (Video Texture)**：將影片作為材質貼圖，結合聲音數據控制 3D 球體位移扭曲與反光。

### 6.3 專案「雙重保險」策略（Dual-Insurance Strategy）
* **視覺上限（滿足美術極致追求）**：隨時能直接吃下林妤安與美術組製作的 TouchDesigner 粒子流體、AE 故障特效或 Lottie 向量動畫。
* **穩定下限（工程保底，絕不拖累考研）**：若期末時限緊迫或美術未完成，內建的 **CSS Variable Fonts + Canvas 2.5D 加算發光粒子** 隨時在底層待命，**專案 100% 順暢交件展示，絕不卡死**！

---

## ⚠️ 七、 現場實戰老手視角：36 大極致致命的「隱性坑點」與避坑防線 (Hidden Edge Cases & Defense)

### 7.1 可變字體 (Variable Fonts) 本地離線快取陷阱
* **隱性災難**：依賴 Google Fonts 等外網 CDN，展場斷網時字體降級為新細明體，形變動畫全毀。
* **避坑防線**：將 WOFF2 可變字體打包至本地 `public/fonts/`，寫入 PWA 快取名單，100% 斷網離線可用。

### 7.2 iOS / Safari 跨平台透明影片的「黑底災難」(WebM Alpha)
* **隱性災難**：iOS Safari 絕大多數核心不支援 WebM Alpha，手機掃碼開影片直接黑底或報錯。
* **避坑防線**：手機成果展示頁嚴禁使用 WebM Alpha，改採 Canvas 2D 靜態海報合成或黑底影片 `mix-blend-mode: screen`。

### 7.3 瀏覽器 AudioContext 的自動播放（Autoplay Policy）靜音鎖
* **隱性災難**：未在使用者手勢時解鎖，音訊引擎處於 `suspended` 凍結狀態，麥克風採樣數值全為 0。
* **避坑防線**：在 `LANDING` 頁「開始體驗」按鈕的 `pointerdown` 事件上強制綁定 `audioCtx.resume()` 與 `getUserMedia()`。

### 7.4 麥克風噴麥爆音（Clipping）與展場喇叭迴音自激（Feedback Loop）
* **隱性災難**：大吼時訊號飽和削頂破壞 DTW；展場外接喇叭播放原片聲音被麥克風重複收錄引發自激尖叫。
* **避坑防線**：Web Audio 鏈路掛載 `DynamicsCompressorNode` 壓制爆音；`PROMPT_VIDEO` 播放期間切斷麥克風採樣通道。

### 7.5 美術夥伴視覺資材交期延遲風險
* **隱性災難**：設計組夥伴過度微調細節導致資材延遲交稿，拖累工程進度。
* **避坑防線**：貫徹「雙重保險策略」，Week 6 前工程端以方案 B 自帶字體與粒子 100% 完工，架構預留插槽隨時熱插拔，完全不影響備考。

### 7.6 Circular Buffer 歸零指標失鎖與錄音提前結束之 DTW 切片防護
* **隱性災難**：體驗結束指標未歸零導致下一位讀到上一人殘留數據；提早結束未填滿的 0 被 DTW 判定為聲音暴跌扣成 0 分。
* **避坑防線**：每次切換至 `RECORDING` 強制 `volumeBuffer.fill(0)` 與 `head = 0`；傳給 DTW 時僅切片取有效長度 `volumeBuffer.subarray(0, recordedFrames)`。

### 7.7 物理平滑模型 Delta Time 補償與急促短音 (Staccato) 停頓動態響應
* **隱性災難**：公式寫死硬編碼導致 120Hz 與 30Hz 回彈速度差 4 倍；連續短音 Decay 過慢卡在高粗度降不下來。
* **避坑防線**：平滑公式引入 `dt` 補償 (`1 - Math.exp(-speed * dt)`)；檢測到音量急速驟降（換氣）時動態加速 Decay 響應保留咬字停頓感。

### 7.8 Canvas 影片繪製之同源同域防護 (Tainted Canvas CORS Lock)
* **隱性災難**：TouchDesigner 影片置於外部未設 CORS 的 CDN，Canvas 繪製後被標記 Tainted，最後海報導出 (`toBlob`) 直接報錯炸毀。
* **避坑防線**：展場影音資材統一置於本地 `public/video/`，確保 100% 同源同域，海報導出絕不觸發 CORS 鎖。

### 7.9 展場 USB 麥克風長時間休眠「假死斷流」之 30 幀心跳重連機制
* **隱性災難**：展場 USB 指向性麥克風長時間休眠後被作業系統開啟節能，喚醒後串流表面正常但讀出數值全為 0。
* **避坑防線**：加入麥克風存活心跳（Liveness Check），喚醒後若前 30 幀音量持續為絕對 0，自動觸發一次靜音重連機制 (`reinitAudioStream()`)。

### 7.10 高音尖叫或破音時字體衝出螢幕可視區 (Y-Offset Boundary Clipping)
* **隱性災難**：體驗者在尖叫或情緒爆發時，基頻突波可能衝至 500Hz~800Hz，若採線性位移映射，文字向上位移可能超過 120px，直接衝出容器外、被頂部導航列遮擋或發生頁面穿透破版。
* **避坑防線**：引入雙曲正切軟箝位函數 $y_{\text{offset}} = 28 \times \tanh((F_0 - F_{\text{base}}) / 80)$，物理位移嚴格收斂在安全區間 `[-28px, +28px]`，再怎麼飆高音也能在保證張力的同時 100% 不破界。

### 7.11 展場背景人聲嘈雜誤判為「拉長音」導致字體永久橫向肥大 (False Sustained Lock)
* **隱性災難**：展場周圍其他觀眾交談或背景低頻機器嗡鳴穩定震盪，被系統誤判為「持音」，導致體驗者還沒開口，字體就持續維持橫向 150% 膨脹肥大。
* **避坑防線**：拉長音判定加上「動態信噪比檢驗（SNR Check）」，必須超過即時環境底噪 15dB 以上；同時設置 1.8 秒硬性超時熔斷機制（Max Sustained Timeout），超時自動衰減釋放。

### 7.12 中文字體 (CJK) 可變字軸支援度不足之字形殘破退化 (CJK Variable Font Axis Fallback)
* **隱性災難**：市面上大量開源中文字體僅支援 `wght`（粗細變形），幾乎不支援 `wdth`（寬度伸展）；直接在 CSS 設定 `font-stretch` 在非支援字體上會被瀏覽器強制忽略無效，導致拉長音效果完全失效。
* **避坑防線**：採用「雙軸合璧保險（Dual-Axis Hybrid Pipeline）」——CSS Variable 同步輸出 `--v-width`，並在字元樣式上同時宣告 `font-stretch: var(--v-width)` 與 `transform: scaleX(calc(var(--v-width) / 100))`。有字體寬度軸時走原生向量插值，若無寬度軸則自動無縫走 GPU 幾何拉伸，100% 保證任何中文字體均能流暢拉長！

### 7.13 饒舌與極速咬字 (16分音符高頻脈衝) 造成的視覺閃爍致癲癇風險 (Visual Strobe Fatigue)
* **隱性災難**：遇到快嘴饒舌或快速爆破音，音量在 1 秒內劇烈跳動 8~12 次，字體高頻劇烈閃爍膨脹（Strobe Effect），體驗者與評審長時間觀看容易產生視覺暈眩與眼睛疲勞。
* **避坑防線**：在 Attack 訊號上升沿植入 25ms 最小遲滯平滑（Hysteresis Low-pass Filter），過濾掉毫秒級雜訊微震，保留具音樂節奏感的俐落咬字縮放，而非機械式高頻抽搐。

### 7.14 體驗者唸錯台詞或停頓過長之 DTW 脫軌與字體失步 (Utterance Misalignment)
* **隱性災難**：現有企劃書假設體驗者會照著字幕 100% 準確講出台詞。但若體驗者太緊張唸錯字、停頓 2 秒或少唸三個字，DTW 比對的時間軸會發生「強制拖拉對齊」或文字變形與聲音完全對不上的尷尬場面。
* **避坑防線**：在 Step 3 錄音時採 **「雙軌獨立解耦」**：即時字體變形直接連動當前聲波 Audio Volume/Pitch（即時反應）；DTW 演算法僅在錄音結束後，針對聲音能量與音高走勢進行「整體特徵曲線形態比對」，不強制要求每個字音節 1:1 時間戳死鎖。

### 7.15 團隊視覺進度與工程端開工時間差之協作心理落差 (Design Collaboration Buffer)
* **隱性災難**：林妤安身為視覺總監，對美感要求極高。如果工程端過早掏出完整的彩色 UI，可能會讓她產生「視覺已經被工程定死、我沒發揮空間」的誤解或拉鋸壓力。
* **避坑防線**：Demo 時保持 **「Wireframe / 灰階骨架插槽展示」**。溝通時明確告知：「**最難的聲音演算法和字體動態變形骨架我已經寫好了，所有的視覺質感（顏色、字體、背景影片、UI 風格）全數留給妳主導！底層留了插槽，妳隨時可以替換資材。**」

### 7.16 展場筆電與觸控大螢幕之「休眠黑屏」與「系統 DPI 縮放 (125%/150%)」破版
* **隱性災難**：課堂展示或展場長時間放置時，Windows/Mac 的「螢幕自動關閉/睡眠」或「系統 DPI 縮放 (125%/150%)」會導致 Canvas 渲染變形或頁面中斷。
* **避坑防線**：在 `LANDING` 狀態植入 `navigator.wakeLock.request('screen')` (Web Wake Lock API) 阻止螢幕休眠；離屏 Canvas 與文字變形容器採用固定 `CSS Aspect Ratio (9:16)` 與 `viewBox` 計算，徹底不受系統 DPI 縮放影響。

### 7.17 手機端 QR Code 開啟後「LINE / 微信內建 Webview 限制」與離線保全
* **隱性災難**：體驗者若使用 LINE 或微信內建瀏覽器掃描 QR Code，這些 App 的 Webview 常會限制 Cookie / LocalStorage 或阻擋外鏈。
* **避坑防線**：`/share-speak` 手機成果頁保持為 **「零依賴純 HTML/CSS + Cloudinary 圖片直載」**，完全不讀寫 LocalStorage，不調用複雜 API，確保用任何通訊軟體內建瀏覽器開啟均能 0.1 秒無痛載入海報！

### 7.18 AudioContext 斷網主機板電池時間戳漂移陷阱 (NTP Desync vs Hardware Clock)
* **隱性災難**：某些展示老電腦在斷網狀態下，若主機板 CMOS 水銀電池老化，重開機後系統時間會跳回 1970 年，導致依賴 `Date.now()` 的計時器出現 `NaN` 或時間反轉崩潰。
* **避坑防線**：系統時間軸一律依賴聲卡 DAC 晶片硬體時鐘 `audioCtx.currentTime`，與作業系統日期完全解耦，即便主機板時間錯亂，音訊採樣與錄音倒數精度恆為 0.1ms。

### 7.19 手機掃碼 LINE 內建 Webview 的弱網逾時崩潰 (LINE Webview 5s Timeout)
* **隱性災難**：台灣大眾習慣用 LINE 掃描 QR Code，若分享頁面背景加載超過 3MB 的多餘腳本，在地下室或展場弱網下 5 秒即會強制被 LINE 攔截並報「無法連線至網頁」。
* **避坑防線**：手機端分享頁執行嚴格的「極簡資源打包」，全頁靜態資材總量壓制在 120KB 以內，即使在展場地下室僅剩 1 格 3G 訊號也能 0.2 秒秒開。

### 7.20 離線 4K 影片硬體解碼掉幀陷阱 (CPU 100% Spike vs H.264 Baseline 1080P)
* **隱性災難**：美術組交付未經轉碼的高碼率 4K ProRes 或高規格 HEVC 影片，在離線機台筆電上因無網路下載專用解碼器，觸發 CPU 軟解導致 CPU 飆到 100%，動態字體幀率瞬間跌至 10fps。
* **避坑防線**：制定嚴格的《資材入庫標準》：示範與疊加影片一律強制壓縮為 **1080P、H.264 Baseline Profile、碼率 $\le$ 3.5Mbps、無音軌**，確保 10 年前的老筆電也能無痛硬解 60fps。

### 7.21 現場 500 人高密 2.4GHz 頻段藍牙干擾與麥克風爆音斷流 (Wireless Mic Interference)
* **隱性災難**：展場現場參觀者眾多，數百支手機的 2.4GHz WiFi 與藍牙熱點會嚴重衝擊無線麥克風接收器，造成隨機爆音、斷流甚至音量歸零。
* **避坑防線**：展場收音嚴格規定**「禁止使用任何消費級 2.4GHz 無線麥克風」**，堅決採用有線 USB 指向性麥克風或 XLR 轉 USB 介面，物理隔絕一切空中頻段干擾。

### 7.22 聲控模式下「原片示範音效」自觸發錄音死循環 (Acoustic Echo Loop Trigger)
* **隱性災難**：在全聲控模式下，機台播放 `PROMPT_VIDEO` 示範原音（如蠟筆小新「Oh~更愛你了」），喇叭播出的聲音被同一台機台的麥克風收錄，系統誤以為是體驗者在講話，示範影片剛放完就瞬間把原聲錄進去並自動送出評分，造成自問自答的荒謬閉環。
* **避坑防線**：建立「音訊監聽狀態閘門（Acoustic Gate Lock）」。在 `PROMPT_VIDEO` 播放期間，軟體層強制將聲控觸發監聽器完全靜音（Mute VAD Listener）；待示範影片播放完畢、螢幕出現顯眼的「換你說話（NOW YOUR TURN）」倒數結束後，才精準在第 0 毫秒解鎖麥克風聲控觸發！

### 7.23 簡報筆「長按連擊 (Key Repeat)」引發連跳多頁崩潰 (Presenter Clicker Auto-Repeat Flood)
* **隱性災難**：展場人員手持 USB 簡報筆導覽時，緊張或手指用力按住翻頁鍵不放，作業系統觸發鍵盤重複輸入（Auto-repeat 每秒發送 30 次 `ArrowRight` / `Space`），導致互動狀態機在 0.5 秒內連續跳過示範、錄音、評分，直接殺到結束頁。
* **避坑防線**：在鍵盤與簡報筆監聽層嚴格加入 `if (event.repeat) return;` 攔截，且所有按鍵動作強制綁定 `keyup`（放開才判定）而非 `keydown`，徹底封死長按連發可能。

### 7.24 觸控螢幕「水滴/手汗/多人雙指」引發手勢縮放 (Pinch-to-Zoom) 破版
* **隱性災難**：展場採用大尺寸電容觸控螢幕，因觀眾手汗或多人同時好奇觸碰，瀏覽器預設將雙指判定為畫面放大（Pinch to Zoom），導致整個 UI 破版、位移、按鈕移出畫面外且無法縮回。
* **避坑防線**：在 HTML `index.html` 的 viewport 強制寫死 `user-scalable=no, maximum-scale=1.0, minimum-scale=1.0`，並在全域 CSS 根節點加入 `touch-action: manipulation; -webkit-user-select: none; user-select: none;`，並在 `touchstart` 掛載雙指 `e.touches.length > 1` 時的 `e.preventDefault()`。

### 7.25 手機遠端遙控被路人掃碼「惡意搶奪控制權」 (Remote Hijacking Defense)
* **隱性災難**：若手機遠端遙控的 QR Code 長期顯示在大螢幕角落，路過好奇的民眾隨手拿手機一掃，也能進入遙控頁面，在他人正在體驗時胡亂點擊下一頁或重開，破壞展演流程。
* **避坑防線**：遠端遙控入口嚴格實施「動態短期 Token + 維護者專屬喚出」：平時大螢幕絕不顯示遙控 QR Code，僅能由工作人員連點螢幕左上角 5 次在「維護者暗樁抽屜」中喚出，或採用動態 4 位數 PIN 碼配對，超過 1 台手機連入時自動剔除舊連線。

### 7.26 零碰觸模式下「長時間無滑鼠移動被作業系統判定為休眠」 (OS Idle Screen Sleep)
* **隱性災難**：在全聲控或手機遙控模式下，實體展機沒有任何實體滑鼠或鍵盤移動事件，Windows 或 macOS 系統在 5~10 分鐘後自動觸發螢幕保護程式或直接關閉螢幕黑屏，展場直接斷電感。
* **避坑防線**：除了調用現代瀏覽器的 `navigator.wakeLock.request('screen')` 之外，系統每當 FSM 進行任何一次狀態跳轉，便以 JS 向 DOM 發射微小的虛擬活性心跳（Heartbeat Synthetic Pointer Event），並在展演指南中提供 Windows / Mac 一鍵關閉休眠的 Power Management 設定檔指令。

### 7.27 前端純 JS 轉 GIF 導致主執行緒凍結 15 秒與記憶體爆表 (GIF Palette Quantization Main-Thread Lock)
* **隱性災難**：若採納設計端「直接導出動態 GIF」的要求，在前端使用傳統 JS GIF 編碼庫，每個像素要計算 NeuQuant/Octree 顏色量化矩陣。90 幀 1080x1920 畫面會讓瀏覽器主執行緒凍結 12~15 秒，無響應跳出「網頁沒有回應」，記憶體暴衝 1.2GB 導致平板或筆電當場崩潰白屏。
* **避坑防線**：堅決杜絕主執行緒 GIF 編碼，改採「Living Web Poster（Canvas 活體海報）+ 原生硬體加速編碼 WebM/MP4」，0 主執行緒負擔，秒級產出，色彩為 1677 萬全彩且體積縮小 80%。

### 7.28 嘶吼過猛導致文字物理縮放「破版橫向衝出螢幕或海報框外」 (Unconstrained Font Scale Overflow)
* **隱性災難**：使用者對著麥克風大聲嘶吼時，文字尺寸隨著音量放大（Scale 1.75x），多字數台詞（如「絕對不會向這個世界認輸！給我聽清楚！」）會直接橫向衝出螢幕與海報框，字體兩端被硬生生截斷，成果海報破版難看。
* **避坑防線**：建立「容器寬度自適應防撞幾何計算（Auto-Fit Safe Bounding Box）」：文字外層容器掛載 `max-width: 90%; word-break: break-word;`，並在 JS 根據字數即時計算基準字級，當音量 scale 放大超過邊界閾值時，自動限制上限並緊縮行距，確保文字永遠鎖定在視覺框核心。

### 7.29 結算頁喇叭回放個人原音時「再次被麥克風收錄引發評分竄改」 (Voice Playback Acoustic Loop)
* **隱性災難**：體驗者在結算頁按下「▶️ 聆聽我的原音重現」，喇叭大聲播放他剛才的錄音，此時若麥克風仍處於活躍採樣狀態，播放出來的聲音又被 Web Audio 收錄，甚至干擾下一次體驗者的底噪校準。
* **避坑防線**：在調用 `audio.play()` 播放原音回放的瞬間，系統強制向 Web Audio 音訊管線發送 `muteInput(true)`（硬性靜音麥克風 GainNode 50ms），音訊播畢後透過 `onended` 事件才安全解鎖收音。

### 7.30 iOS Safari 對 WebM/Opus 音訊編碼的「靜音相容性黑洞」 (iOS Safari WebM Audio Black Hole)
* **隱性災難**：大機台 Chrome 錄製的音訊格式預設為 `audio/webm;codecs=opus`，民眾用 iPhone 掃碼在 Safari 或 LINE Webview 開啟時，Safari 核心底層不原生支援 WebM 音訊解碼，導致手機端點擊播放完全無聲。
* **避坑防線**：在機台端調用 `MediaRecorder.isTypeSupported('audio/mp4')` 或在錄製時封裝為通用的 PCM WAV / MP3 容器，或在手機端採用 Web Audio 解碼器降級支援，確保 iPhone 與 Android 100% 皆能清晰出聲。

### 7.31 連續 100 位體驗者錄音造成「瀏覽器 Blob 記憶體洩漏與展機閃退」 (Blob Object URL Memory Leak)
* **隱性災難**：每一位體驗者錄製的 5 秒音訊都透過 `URL.createObjectURL(blob)` 生成記憶體指針，若在回到 `LANDING` 迎賓待機時未顯式調用 `URL.revokeObjectURL()`，展覽連續運作 3 天、接待數百人後，記憶體洩漏累積達數 GB，導致展機瀏覽器無預警崩潰閃退。
* **避坑防線**：建立嚴格的「生命週期資源回收閥門」：在 FSM 狀態跳轉回 `LANDING` 或看門狗自動退回時，自動執行 `URL.revokeObjectURL(audioBlobUrl)` 與 `blob = null`，記憶體常駐永遠控制在 150MB 以下。

### 7.32 Web Speech API 在特定 Windows / Linux 系統上的「缺少中文語音庫缺語系災難」 (TTS Voice Pack Absence)
* **隱性災難**：部分純英文版 Windows 展機或精簡版 Chrome 沒有安裝本機中文語音套件（`zh-TW`），呼叫 `speechSynthesis.speak()` 時因找不到可用語音庫直接靜默或報錯，示範語音完全啞巴。
* **避坑防線**：在 TTS 初始化時遍歷 `speechSynthesis.getVoices()` 建立階梯式語言回退清單：優先匹配 `zh-TW` -> 次選 `zh-HK`/`zh-CN` -> 若系統完全無中文語音庫，自動調用預設短音或直接播放內置示範 MP3，保證 100% 絕對發聲不靜默。

### 7.33 Chrome 核心 Web Speech API 播放超過 15 秒「垃圾回收靜默卡死 Bug」 (TTS Silent Hang Bug)
* **隱性災難**：Chromium 核心存在長達 8 年的已知 Bug：當 `SpeechSynthesisUtterance` 實例未被全域強引用時，播放超過 10~15 秒會被 V8 垃圾回收器提前 GC 回收，導致示範語音唸到一半突然無預警中斷，且後續所有 TTS 調用全部掛死。
* **避坑防線**：在組件內部將當前 `utterance` 實例賦予 `window.__activeUtterance` 全域強引用，並設置長語句暫停重啟心跳閥門，徹底繞過 Chromium 核心的 GC 假死缺陷。

### 7.34 展場 80dB 吵雜環境下示範語音「被背景噪音淹沒」之清晰度劣化 (Acoustic Masking in Public Space)
* **隱性災難**：展演現場人聲鼎沸（背景噪音約 75~80dB），展示螢幕或筆電內建喇叭功率不足，示範語音如同細語，觀眾就算貼在螢幕前也聽不清楚語調示範。
* **避坑防線**：在 Web Audio 示範音訊鏈路上掛載專屬語音動態壓縮器（`DynamicsCompressor`），提振 1kHz~4kHz 人聲可懂度頻段，並在畫面上提供高對比「🔊 點擊重新聆聽示範」重播按鈕；展演指引強制建議現場外接至少 15W 指向性喇叭或耳筒。

### 7.35 體驗者急躁「在示範音效尚未播完即強按開始模仿」引發音軌串音競爭 (Skip Demo Race Condition)
* **隱性災難**：急性子觀眾不等示範語音唸完，直接猛點「我聽懂了，換我模仿」，若示範音效仍在背景播放，而麥克風已開始錄音，喇叭播出的示範音會被直接錄進體驗者的錄音中，嚴重扭曲 DTW 比對評分。
* **避坑防線**：在執行 `handleStartRecording` 的第 0 毫秒，強制向音訊引擎發送全域靜音與中斷指令：`speechSynthesis.cancel()`、`demoAudio.pause()` 並重置指針，確保錄音開始時喇叭 100% 絕對純淨。

### 7.36 示範 MP3 遠端加載延遲導致「畫面進度條先跑完、聲音才剛開播」的嚴重音畫不同步 (MP3 Preload Delay Drift)
* **隱性災難**：若實體原片示範 MP3 未設預載，在展場地下室弱網下需 1.2 秒才載入完成，此時畫面上的波形柱已經跑過大半，聲音才突然冒出來，音畫嚴重錯位破壞沉浸感。
* **避坑防線**：在 `LANDING` 迎賓待機階段，背景 PWA Service Worker 與 `<link rel="preload">` 自動將 4 大情境之示範短音（總量 < 800KB）提前預載至本地 RAM 記憶體，進入示範頁時 0ms 秒播，達成絕對音畫物理同步。

---

## 📅 八、 開發時程與里程碑規劃 (Milestones)

* **Week 1-2：基礎管線搭建**
  * 移植《PULSE LAB》基底，移除 MediaPipe，植入 `useAudioAnalyzer`。
  * 打包本地可變字體至 `public/fonts/`，完成 CSS 變數直通與 60fps 驗證。
  * 建立 `DynamicMediaOverlay` 影音資材插槽組件。
* **Week 3-4：3D 視覺、影音整合與體驗狀態機**
  * 整合 R3F 液態材質與光暈粒子，測試 TouchDesigner 影片疊加。
  * 實裝 `PROMPT_VIDEO` 播放器與錄音倒數流程（含喇叭防迴音通道切換）。
* **Week 5：DTW 評分與海報導出**
  * 完成聲波比對評分演算法（含有效長度切片防護）。
  * 實裝 9:16 聲音卡片 Canvas 合成與 Cloudinary 直傳（含 3 秒逾時本機降級）。
* **Week 6：MVP 驗收與展場調校**
  * 實測指向性麥克風、動態壓縮防爆音與 300ms 環境底噪校準。
  * 完成線上 Vercel 發布與手機 QR Code 掃碼閉環演示。

---

## 🤝 九、 線上開會 3 分鐘向林妤安與林科余快速對齊之「極簡技術與分工 Check List」

這是一份專為工程負責人設計的**「3 分鐘定心丸話術與資材交付清單」**，能讓設計負責人林妤安感到最大程度的尊重，同時確保工程端零被動拉鋸：

### 9.1 開場 30 秒定心丸話術
> 「妤安、科余好！我這邊已經把《See How You Speak》最底層的**硬核技術管線 100% 搞定**了：
> 1. Web Audio 人聲基頻捕捉與 300ms 環境底噪校準。
> 2. 60FPS 零掉幀的『字體隨聲音變形、上下波浪、拉長音滑動延展』管線。
> 3. 一維 DTW 聲音相似度評分演算法。
> 4. **展場地下室 0 外網依賴的「聲學 DNA 參數化海報秒繪 QR Code」（就算現場完全沒 WiFi，民眾手機掃碼 0.05 秒照樣拿到高清海報）**。
> 
> 目前畫面上看到的只是**『功能驗證骨架（Wireframe MVP）』**。所有的視覺質感——**包括字體風格、背景動態影片、情緒主題色與 UI 排版——底層全部留好了『熱插拔資材槽』，100% 交由妳們主導！**」

### 9.2 美術組 4 大資材交付規格表（直接丟給林妤安即可）
| 資材類別 | 建議格式與規格 | 存放目錄 | 說明 |
| :--- | :--- | :--- | :--- |
| **① 背景/特效動態影片** | 1080x1920 (9:16) MP4 (H.264), 黑底或透明, 碼率 $\le$ 3.5Mbps, 3~5 秒循環 | `/public/video/` | 支援 TouchDesigner / AE 輸出，以 `mix-blend-mode: screen` 疊加。 |
| **② 可變中英文字體** | `.woff2` 格式，支援 `wght` (100~900) 或 `wdth` (75~150%) | `/public/fonts/` | 支援任何開源或自製字體，在 `fontRegistry.json` 註冊即可熱套用。 |
| **③ 4 大情緒情境設定** | 台詞文字、角色名稱、提示說明、HEX 主題色碼 | `src/config/speakScenarios.ts` | 隨時修改文字與色碼，全站一秒自動換膚。 |
| **④ 成果海報裝飾元素** | PNG / SVG 標誌、展覽專屬邊框準心 | `/public/assets/` | 離屏 Canvas 合成引擎自動抓取並印上海報。 |

### 9.3 雙方職責與驗收邊界（清晰防禦）
* **工程端（你）**：負責 60FPS 渲染效能、音訊訊號穩定、DTW 評分精準、展場斷網離線自癒保底、手機無外網秒繪海報。
* **視覺端（林妤安）**：負責選定主視覺字體、產出 TouchDesigner 背景素材、定調 4 大情緒色系與海報版型美感。

---
*本企劃書已儲存於本機專案目錄中，可直接作為專案規格標準執行。*
