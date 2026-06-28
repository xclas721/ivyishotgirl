<template>
  <main class="app-shell">
    <header class="page-head">
      <div>
        <h1>AM 業績獎金規則</h1>
        <p>
          AM 業績獎金新制 V2 — 獎金按回簽季度算，發放時間看收款季度。這頁是帳本的試算摘要，完整制度以官方文件為準。
        </p>
      </div>
      <div class="head-controls">
        <a
          class="rules-source-link"
          :href="COMMISSION_RULES_URL"
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink :size="14" :stroke-width="2" />
          官方制度說明（V2）
        </a>
      </div>
    </header>

    <!-- Formula -->
    <section class="panel">
      <h2>計算公式</h2>
      <div class="formula-box">
        <div class="formula-main">
          最終業績獎金 ＝ Σ（案件未連稅金額 × 基礎%）× 業績火箭 × 回購倍率 × 客單價倍率 × 成材率倍率
        </div>
        <p class="hint" style="margin-top: 12px; margin-bottom: 0">
          每個案子先按客戶類型算「基礎獎金」，整季加總後再乘上四個季度倍率，就是最終獎金。
        </p>
      </div>
    </section>

    <!-- Customer types -->
    <section class="panel">
      <h2>客戶類型與基礎獎金%</h2>
      <div class="rules-table-wrap">
        <table class="rules-table">
          <thead>
            <tr>
              <th>客戶類型</th>
              <th>基礎獎金%</th>
              <th>適用對象說明</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><span class="customer-pill biz">商業合作</span></td>
              <td class="rate-cell">2%</td>
              <td class="desc-cell">企業商業合作、B2B 案件</td>
            </tr>
            <tr>
              <td><span class="customer-pill kitchen">廚具商</span></td>
              <td class="rate-cell">3%</td>
              <td class="desc-cell">廚具廠商帶入案件</td>
            </tr>
            <tr>
              <td><span class="customer-pill designer">設計師</span></td>
              <td class="rate-cell">4%</td>
              <td class="desc-cell">室內設計師帶入案件</td>
            </tr>
            <tr>
              <td><span class="customer-pill personal">個人業主</span></td>
              <td class="rate-cell">5%</td>
              <td class="desc-cell">個人業主直接案件（最高基礎%）</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="notice">
        客戶類型於新增報價單時選擇、表格中可隨時調整；基礎獎金% 依所選類型自動帶入，不需手動填寫。
      </p>
    </section>

    <!-- Multipliers -->
    <section class="panel">
      <h2>四大季度倍率</h2>
      <p style="color: var(--color-muted); font-size: 14px; margin-bottom: 20px">
        倍率每季依業績結果核定，公司公佈後填到「季度倍率設定」。預設都是 1。
      </p>
      <div class="multiplier-cards">
        <div class="multiplier-card">
          <TrendingUp class="mult-icon" :size="20" :stroke-width="1.5" />
          <div class="mult-body">
            <h3>業績火箭倍率</h3>
            <p>依季度業績總額達成區間核定，業績越高、倍率越大。</p>
          </div>
        </div>
        <div class="multiplier-card">
          <Repeat2 class="mult-icon" :size="20" :stroke-width="1.5" />
          <div class="mult-body">
            <h3>回購倍率</h3>
            <p>依季度回購客戶占比核定，回購率越高、倍率越大。</p>
          </div>
        </div>
        <div class="multiplier-card">
          <Banknote class="mult-icon" :size="20" :stroke-width="1.5" />
          <div class="mult-body">
            <h3>客單價倍率</h3>
            <p>依季度平均案件未連稅金額核定，客單價越高、倍率越大。</p>
          </div>
        </div>
        <div class="multiplier-card">
          <Target class="mult-icon" :size="20" :stroke-width="1.5" />
          <div class="mult-body">
            <h3>成材率倍率</h3>
            <p>依板材利用率（成材率）核定，利用率越高、倍率越大。</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Quarter mapping -->
    <section class="panel">
      <h2>季度月份對照</h2>
      <div class="quarter-map">
        <div v-for="q in quarters" :key="q.key" class="qmap-card">
          <div class="qmap-key">{{ q.key }}</div>
          <div class="qmap-months">{{ q.months }}</div>
          <div class="qmap-note">{{ q.note }}</div>
        </div>
      </div>
    </section>

    <!-- Notes -->
    <section class="panel">
      <h2>注意事項</h2>
      <ul class="rules-list">
        <li>
          完整制度說明、倍率區間與實施時程見
          <a :href="COMMISSION_RULES_URL" target="_blank" rel="noreferrer">AM 業績獎金新制 V2 官方文件</a>。
        </li>
        <li>獎金以回簽月份決定所屬季度，與收款月份無關。</li>
        <li>收款月份決定發放季度（實際領取時間）。</li>
        <li>同一季的案子共用一組倍率，整季一致。</li>
        <li>倍率自 2026-Q2 起適用；在此之前的季度（含 2026-Q1）只計基礎獎金，不套用倍率。</li>
        <li>1 月回簽歸入前一年度 Q4（11 月 – 次年 1 月）。</li>
        <li>客戶類型於新增報價單時選擇，表格中可隨時更改；基礎獎金% 由類型自動帶入，再同步不覆寫類型。</li>
        <li>金額以報價單的「未連稅金額」為準。</li>
      </ul>
    </section>
  </main>
</template>

<script setup lang="ts">
import { TrendingUp, Repeat2, Banknote, Target, ExternalLink } from 'lucide-vue-next'

const COMMISSION_RULES_URL = 'https://kpi.qsm.group/commission-explain'

const quarters = [
  { key: 'Q1', months: '2 月 – 4 月', note: '（農曆年後啟動）' },
  { key: 'Q2', months: '5 月 – 7 月', note: '' },
  { key: 'Q3', months: '8 月 – 10 月', note: '' },
  { key: 'Q4', months: '11 月 – 次年 1 月', note: '（跨曆年，1 月歸前年 Q4）' },
]
</script>
