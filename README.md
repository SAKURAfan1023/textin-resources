# TextIn Resources · 运营操作指南

控制台 **Files（文件）→ README.md** 可查看本指南。每篇文章只维护一个 MDX：页头配置首页和列表展示，下面编写正文。

## 1. 打开文章

| 要做什么 | 打开哪里 | 修改位置 |
| --- | --- | --- |
| 修改 Blog | Navigation（导航）→ Blog → 对应文章 | 正文直接编辑；配置打开 `… → Source mode（源码模式）` |
| 修改案例 | Navigation（导航）→ Case Studies → 对应客户 | 同上 |
| 修改标题、摘要 | 当前文章 → `… → Source mode（源码模式）` | 页头的 `title`、`description`，同步首页、列表和详情 |
| 选入首页、撤下、排序 | 当前文章 → 源码模式 | `listing.homeOrder` |
| 修改封面、日期、分类、客户与 Point | 当前文章 → 源码模式 | `listing` 区域 |
| 下架文章、恢复发布 | Navigation（导航） | 拖入 **Draft** 下架；拖回 **Blog** 或 **Case Studies** 恢复 |
| 上传图片 | Files（文件）→ `images/` | 上传后将路径填入当前文章 |

标题、摘要与列表配置统一在源码模式填写；页面设置仅在新增文章时用于设置网址路径，无需重复填写内容。

文章路径就是文件位置，例如 `cases/acme-contract-review.mdx` 对应 `/cases/acme-contract-review`。已上线文章保留原路径。

## 2. 决定 Resources 首页展示什么

<img src="images/guide/home-selection.webp" alt="Resources 首页与 homeOrder 配置对照" />

在文章页头的 `listing` 内修改：

```yaml
listing:
  homeOrder: false
```

| 配置 | 首页结果 |
| --- | --- |
| `homeOrder: false` | 从首页撤下，保留字段；列表和详情仍正常展示 |
| `homeOrder: 10` | 选入首页，数字越小越靠前 |
| `10`、`20`、`30` | 按顺序展示；插入一篇时可填 `15` |
| 多篇填写相同数字 | 按日期从新到旧，再按文章路径排序 |
| 同一类全部设为 `false` | 首页隐藏该文章区块；入口卡片与列表仍保留 |

Blog 自动进入 **Latest from the Blog**，案例进入 **Case Studies**，两组独立排序。数量不限，页面自动增加行数。没有选中的文章不会自动补入。

填写 `false` 时不加引号；展示时填大于 `0` 的整数，不填 `true`、`0` 或带引号的数字。新文章模板默认带上 `homeOrder: false`；遗漏时自动补回 `false`。

首页排序与列表的 `order`、`featured` 分开。只调整首页时，不修改这两个字段。首页 Hero、入口说明和公共 CTA 由开发维护。

## 3. 新增文章

1. 右上角 **… → Branches（分支）**，新建内容分支，例如 `content/new-customer`。
2. 点击 **New page（新建页面）**；在 **… → Page settings（页面设置）→ Path（网址路径）** 填写 `cases/英文短名称` 或 `news/英文短名称`。
3. 打开 **… → Source mode（源码模式）**，用下方对应模板替换初始内容。页头只保留一组 `---`，第二条 `---` 后填写英文正文。
4. 上传封面和已确认的客户 Logo，将模板中的示例客户、日期、图片路径及成果替换为真实内容；没有 Logo 时删除 `customerLogo` 一行。
5. **Publish（发布）→ Save in branch（保存到分支）**，保存到第 1 步的内容分支；按第 8 节检查自动生成和预览，通过后再合并发布。

### Case Studies 模板

中文注释用于填写提示，不显示在正式页面；字段值和正文使用英文。页头用 `#` 注释，正文用 `{/* 中文说明 */}`，不要把说明直接写成正文。

```mdx
---
title: "How Acme makes contract review traceable" # 文章标题：首页、列表、详情共用
description: "How Acme connects extracted clauses to their source documents." # 摘要：首页、列表及详情页描述
keywords: # SEO 关键词，不参与列表筛选
  - contract analysis
  - xParse
listing: # 首页与列表配置
  homeOrder: false # false 不上首页；填 10、20 等正整数选入首页，越小越靠前
  customer: Acme # 客户名称，显示在案例卡片的醒目位置
  industry: # 行业，可填多个；使用第 5 节的英文名称，每行一项
    - Automotive
    - Manufacturing
  scenarios: # 应用场景，可填多个；使用第 5 节的英文名称，每行一项
    - Key information extraction
  product: xParse # 产品标签与筛选；多个产品可填 [xParse, DocFlow]
  date: "2026-10-27" # 展示日期，格式 YYYY-MM-DD；不会定时发布
  cover: /images/cases/acme/cover.webp # 首页与列表封面，先上传图片再填路径
  customerLogo: /images/cases/acme/logo.webp # 卡片客户 Logo；没有时删除这一行
  metric: # 卡片重点 Point，须有正文事实支撑
    value: "60%" # 醒目成果值，也可填英文短语
    label: "less time spent on manual review" # 成果的补充说明
  order: 0 # 列表默认排序，越小越靠前；不影响首页顺序
  featured: false # true 使用列表推荐大卡，每类最多一篇；不自动置顶
---

{/* 在这里用英文介绍客户、所属业务和使用 TextIn 的背景。 */}

## The challenge

{/* 挑战：用英文说明原有流程的问题及其业务影响。 */}

## The solution

{/* 方案：用英文说明处理流程、使用的产品和 TextIn 的作用。 */}

## The results

{/* 成果：用英文写已确认的结果与依据，与上方 metric 保持一致。 */}
```

客户、图片路径和成果均为示例，发布前替换为已确认的信息；没有 Logo 时删除 `customerLogo` 一行。

### Blog 页头模板

在第二条 `---` 后编写英文正文，不只提交页头。

```yaml
---
title: "Your article title" # 文章标题：首页、列表、详情共用
description: "A short summary of the article." # 摘要：首页、列表及详情页描述
keywords: # SEO 关键词，不参与列表筛选
  - document intelligence
listing: # 首页与列表配置
  homeOrder: false # false 不上首页；填 10、20 等正整数选入首页，越小越靠前
  category: Technical # 只选 Technical（技术与指南）或 Announcements（公告与更新）
  product: xParse # 产品标签与筛选，填写单个产品名称
  date: "2026-10-27" # 展示日期，格式 YYYY-MM-DD；不会定时发布
  cover: /images/journal/your-cover.webp # 首页与列表封面，先上传图片再填路径
  readMinutes: 4 # 预计阅读分钟数，正整数；卡片显示 4 min read
  order: 0 # 列表默认排序，越小越靠前；不影响首页顺序
  featured: false # true 使用列表推荐大卡，每类最多一篇；不自动置顶
---
```

`listing` 下缩进两个空格，下一层再缩进两个空格；不使用 Tab。日期和带 `%` 等符号的成果值用引号包住。

## 4. 对照列表找字段

蓝框对应当前文章 `listing` 下的字段，紫框对应同一篇文章的 `title`、`description`。对照图片定位字段。

### Case Studies

<img src="images/guide/cases-fields.webp" alt="案例列表字段对照：客户、Logo、封面、行业、日期、标题、摘要、Point、场景和产品" />

客户名称修改 `listing.customer`；卡片与详情标题修改 `title`；重点 Point 修改 `listing.metric.value` 和 `listing.metric.label`，支持文字，不限于数字。

### Blog

<img src="images/guide/news-fields.webp" alt="Blog 列表字段对照：封面、分类、日期、标题、摘要、阅读时长和产品" />

`listing.readMinutes: 6` 显示 `6 min read`。`category` 只选 `Announcements` 或 `Technical`：前者用于公告、产品更新，后者用于技术解析、实践指南。分类暂无文章时显示空状态。

### 多行业案例

<img src="images/guide/multi-industry.webp" alt="在 MDX 中配置多个行业，分别参与行业筛选" />

`industry` 支持单个名称或数组；`scenarios` 使用数组。多个行业分别参与筛选，同一案例不重复计数。

列表左上角的行业下拉支持搜索和滚动，选项从全部文章汇总，不随数量增加而换行。输入 `auto` 可找到 `Automotive`；点击后更新案例，选择 `All industries` 清除行业条件。菜单搜索只查行业名称，右侧搜索框查案例内容；行业可与场景、产品组合筛选。

## 5. 行业与场景名称

按国内版对应关系选择下面的英文名称，保留大小写，不自行拼接或改写标签。

| 国内行业 | `industry` |
| --- | --- |
| 国央企 | State-owned enterprises |
| 金融 | Financial services |
| 物流 | Logistics |
| 医疗医药 | Healthcare & pharmaceuticals |
| 教育 | Education |
| 制造业 | Manufacturing |
| 交通运输 | Transportation |
| 汽车 | Automotive |
| 软件服务 | Software services |

| 国内场景 | `scenarios` 中的一项 |
| --- | --- |
| 文档信息结构化 | Document structuring |
| 关键信息抽取 | Key information extraction |
| 多语言 OCR | Multilingual OCR |
| 企业知识库与 RAG | Enterprise knowledge bases & RAG |
| 企业 AI 中台建设 | Enterprise AI platforms |
| 教育题库数字化 | Exam digitization |
| 金融投研文档智能处理 | Financial research document processing |
| 应付账款自动化 | Accounts payable automation |
| 智能财务报销 | Expense automation |
| 智能信贷审核 | Credit review |
| 智能国际结算 | Trade finance |
| 物流与贸易单证录入 | Logistics & trade document entry |
| 融资租赁风控与审核 | Lease financing risk assessment |

新标签需由开发同步校验规则。已有案例的行业、场景按原站标签迁移，运营可在文章内调整。

## 6. 其他配置

下表字段位于 `listing` 内，`keywords` 除外。

| 字段 | 结果或规则 |
| --- | --- |
| `order` | 列表默认顺序，数字越小越靠前；省略为 `0`。相同值按日期从新到旧，再按路径排序 |
| `featured: true` | 列表使用推荐大卡；Blog、Case Studies 各最多一篇。不自动置顶，也不决定首页展示 |
| `date` | 显示日期，参与日期排序；未来日期不会定时发布 |
| `product` | Blog 填单个产品；案例支持单个产品或 `[xParse, DocFlow]` |
| `cover` / `customerLogo` | 首页与列表的封面、客户 Logo；不替换正文图片 |
| `metric.value` / `metric.label` | 重点 Point 和说明，均必填，须有事实支撑 |
| `readMinutes` | Blog 阅读分钟数，填正整数 |
| `keywords` | 文章页头关键词，用于 SEO，不新增筛选项 |
| 删除整个 `listing` | 仅移除首页、列表与文章导航，原网址仍可访问；文章下架使用 Draft，不删除配置 |

模板只列运营需要填写的内容。旧文章还包含以下系统字段，内容构建时自动补齐或覆盖；已有字段保留，新文章无需照抄。

| 系统字段 | 用途与来源 |
| --- | --- |
| `sidebarTitle` | Mintlify 导航中的文章名称，与正文左右侧栏无关。案例取 `listing.customer`，未填写时取 `title`；Blog 取 `title` |
| `mode: center` | 使用居中阅读布局，隐藏 Mintlify 默认侧栏和目录；正文两侧的自定义板块由开发维护 |
| `hideFooterPagination: true` | 隐藏详情页默认的上一篇、下一篇链接，不影响列表分页 |
| `timestamp: false` | 隐藏 Mintlify 默认的最后更新时间，不影响 `listing.date` 的展示 |
| `og:image` | 社交分享预览图，由开发维护的站点地址与 `listing.cover` 自动组合 |

运营只修改对应源字段，例如 `listing.customer`、`title`、`listing.cover`，不单独修改这些生成值。`source` 是迁移文章保留的原文地址，不参与列表配置；新写的文章无需填写。

两个列表每页 5 条；搜索、行业、场景、产品和排序覆盖全部文章。首页不受列表分页影响。

## 7. 编写正文与图片

| 操作 | 呈现结果 |
| --- | --- |
| 输入 `/`，选择 Heading 2 / Heading 3 | 章节与小标题；不重复文章标题 |
| 插入或拖入图片 | 在当前位置显示，填写简短英文说明 |
| 插入 List、Table | 要点、对比表格 |
| 官方 Note、Tip、Warning | 提示框 |
| 官方 Steps、Accordion、Tabs | 步骤、折叠区、切换内容 |
| 普通链接 | 站内使用 `/cases/文章路径` 或 `/news/文章路径` |

封面优先使用 WebP，横向构图、重点居中；图片路径以 `/images/` 开头，支持 `.webp`、`.jpg`、`.jpeg`、`.svg`。

正文使用 Markdown 和 Mintlify 官方组件，不添加 `<time>`、`<div>`、自定义组件或脚本。返回列表、信息栏与底部 CTA 自动生成，不编辑 `content:metadata`、`content:footer` 注释之间的内容。页头配置不会显示为正文。

桌面端左侧显示 `Published by`、TextIn Logo，以及 LinkedIn、X、复制链接三个圆形分享按钮；右侧显示目录、注册和联系入口。这些元素由开发统一维护，运营无需在 MDX 中配置。

右侧目录自动读取二级标题（`##`），三级标题和卡片标题不进入目录；运营只需维护正文标题。

手机端将分享和目录收为紧凑工具栏，展开目录后显示注册、联系入口。全站 Discord 悬浮窗与主站一致，由开发维护，文章无需配置。

## 8. 保存、预览与发布

### 拖拽下架与恢复

在 **Navigation（导航）** 中，将文章从 **Blog** 或 **Case Studies** 拖入 **Draft**。Draft 是运营草稿分组，不显示在公开站点；可在其中建立子分组整理文章。只拖动文章，不拖动首页、列表或分页页面，不修改 Draft 的名称。

| 操作 | 自动生成与部署完成后的结果 |
| --- | --- |
| 将文章拖入 Draft | 从首页、列表、筛选索引和公开文章导航移除；原网址临时跳转到对应列表，不再打开文章正文 |
| 在 Draft 中编辑 | 保留原文件、配置与图片；列表配置可暂时不完整，MDX 语法仍须正确 |
| 案例拖回 Case Studies，Blog 拖回 Blog | 按原 `listing` 恢复展示，原网址不变；配置不完整时须补齐后才能发布 |

不需要移动 Files 中的实际文件，也不用增加草稿字段。恢复后是否进入首页仍由 `homeOrder` 决定，列表顺序仍由 `order` 决定。其他文章中手工添加的旧链接会跳到列表，可按需要调整。

拖拽后仍需按下表保存分支、检查预览并发布。线上状态以最新自动生成提交部署成功后的结果为准。Draft 用于内容下架，不用于保密存储；公开 GitHub 仓库仍能查看其源码。

### 发布流程

| 操作 | 结果 |
| --- | --- |
| 编辑正文或页头 | 保存在控制台草稿，尚未更新线上站点 |
| Publish（发布）→ Save in branch（保存到分支） | 提交 MDX 到内容分支；GitHub Actions 的 Content publishing 校验并生成首页、列表、导航和分页 |
| 检查自动生成 | 在 GitHub → Actions → Content publishing 确认 validate、generate 均成功；有生成变化时，分支出现 `content: synchronize articles and lists` 提交 |
| 打开该分支最新提交的站点预览 | 检查首页选取与顺序、列表卡片和筛选、详情及返回列表；不要只看正文编辑器预览 |
| 审核后 Merge and publish（合并并发布），或由负责人合并到 main | 等待 main 的 Content publishing 完成，再确认 Mintlify → Publishes（发布记录）中对应最新提交显示 Successful（成功） |
| 打开正式站点检查 | 确认首页、列表和详情均显示本次内容，完成发布 |

草稿自动保存不会重建完整首页和列表；它们跟随提交到 Git 的 MDX 更新。Mintlify 构建与 Actions 分别运行，以自动生成完成后的最新提交为准。自动生成或构建失败时，按报错修正并重新保存分支，成功后再发布。

## 9. 常见问题

| 情况 | 处理 |
| --- | --- |
| 列表有文章，首页没有 | 检查 `homeOrder` 是否为正整数；`false` 表示不上首页 |
| 想从首页撤下 | 改为 `homeOrder: false`，保留字段 |
| 想下架整篇文章 | 在 Navigation 中拖入 Draft，保存分支并按发布流程完成部署 |
| 想恢复已下架文章 | 从 Draft 拖回原 Blog 或 Case Studies 分组，按发布流程完成部署 |
| 调整首页顺序却影响了列表 | 首页只改 `homeOrder`；列表使用 `order` |
| 新文章不在列表 | 检查完整 `listing`、自动生成和最新预览是否成功 |
| 保存后页面没变 | 确认已提交分支，等待 Content publishing 与预览构建完成 |
| 想取消推荐大卡 | 改为 `featured: false` |
| 页头校验失败 | Actions → Content publishing → validate，按文章路径与字段修正 |
| 提示 `could not be rendered` | 切 Source mode（源码模式）检查非官方标签；自动生成区域问题交给开发 |
| 永久删除、配置重定向、写回失败或合并冲突 | 交给开发处理 |

不要编辑 `index.mdx`、两个 `list.mdx` 或分页文件，自动生成会覆盖它们。公开仓库中不写账号、密钥或未公开资料。

## 10. 开发维护

使用 Node.js 24 LTS：

```sh
npm ci --ignore-scripts
npm run preview
```

预览：[localhost:3001](http://localhost:3001)。保存 MDX 后自动校验、生成并刷新；错误配置保留上次生成结果，修正后自动恢复。已有预览时可单独运行 `npm run content:watch`；一次性生成使用 `npm run content:build`。

`content/site.json` 仅保存站点域名，`content/schema.json` 定义校验规则，均由开发维护。文章配置与正文保存在自身 MDX，不另设文章清单。

草稿状态取自 `docs.json` 顶层 **Draft** 导航分组（包含其子分组），构建时排除对应文章，并维护跳到所属列表的临时重定向（`permanent: false`），恢复时移除。文章路径到自身列表的临时重定向由此流程专用，不手动配置。导航变化也会触发本地预览刷新和 Content publishing。

当前固定版本 CLI 的本地预览不执行上述重定向；在 Mintlify 分支预览中验收旧网址跳转，再合并发布。本地能看到列表撤下不等于旧网址跳转已通过验收。

```sh
npm test
npm run content:check
node --check cases.js
npx --yes mint@4.2.1096 validate
npx --yes mint@4.2.1096 broken-links
```

首次接入须确认控制台仓库绑定、Actions 启用与机器人写回权限，并验证“新增 MDX → 自动生成 → 分支预览 → 合并发布”。本地验证不等于控制台或正式发布已完成。
