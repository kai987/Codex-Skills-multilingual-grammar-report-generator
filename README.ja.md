# Multilingual Grammar Report Generator

[English](README.md) | 日本語

日本語・中国語・英語、およびそれらが混在する文章や字幕から、学習用の文法レポートを作成する Codex スキルと Node.js 実行コードです。各文法項目に自然なオリジナル例文を **1 文**とその訳を付け、JSON と Markdown で出力します。

## 主な機能と公開範囲

- UTF-8 の TXT、SRT、VTT、ASS、SSA、および所定の形式に適合する字幕パッケージ JSON に対応します。任意の JSON を推測で読み込む機能ではありません。
- 字幕から文を再構成し、元のキュー ID、時刻、前後の文脈、確認用フラグを保持します。
- 接続・助詞・活用・条件・敬語・口語の縮約・省略などを文脈に沿って説明します。
- バージョンを固定した SudachiPy と `sudachidict_core` で日本語の読みを補完し、確定できない実質的な未知語の読みは `null` にします。
- 解析を Zod、最終レポートを JSON Schema で検証し、`grammar-report.json` と `grammar-report.md` を生成します。
- 有効な解析を文単位でキャッシュし、未完了・検証失敗の文を再試行します。

コア実行コード、CLI、スキル、スキーマ、読み補完スクリプト、関連テストを収録しています。生成済みレポート、ユーザーの入力、キャッシュ、Python 仮想環境、導入済み依存関係、モデルの重み、メディアは同梱しません。音声認識、字幕の検索・取得、動画との同期確認、学習サイトの生成は対象外です。

## インストール

**Node.js 24 系、npm 11 系、`venv` と `pip` が使える Python 3** が必要です。パッケージマネージャーは `npm@11.18.0` に固定し、npm 12 は対応範囲外です。初回のパッケージ・辞書導入にはネット接続が必要です。ローカル LLM やモデルの重みは不要です。

クローンしたリポジトリのルートで実行します。

```bash
git clone https://github.com/kai987/Codex-Skills-multilingual-grammar-report-generator.git
cd Codex-Skills-multilingual-grammar-report-generator
node --version
npm --version
npx --yes npm@11.18.0 ci
npm run build
npm run setup:readings
npm test
```

npm 11.18.0 が有効なら `npm ci` でも導入できます。**CLI の実行前にビルドしてください。** ワークスペース内のパッケージはコンパイル済みファイルを参照するためです。ソース変更後も再ビルドします。

`setup:readings` は `.venv-sudachi` を作成し、[`scripts/requirements-sudachi.txt`](scripts/requirements-sudachi.txt) に指定された SudachiPy 0.6.11 と SudachiDict-core 20260428 を導入します。初回は辞書パッケージをダウンロードし、その後の読み補完はローカルで動きます。既存環境を使う場合は `SUDACHI_PYTHON` で指定できますが、同じ固定バージョンが必要です。ラッパーは Host の確定処理と OpenAI モードの実行前に読み補完環境を確認します。

Codex でこのクローンを開き、[スキルの `SKILL.md`](.agents/skills/multilingual-grammar-report-generator/SKILL.md) に従って、選んだ文章・字幕を解析するよう依頼してください。**`SKILL.md` だけをグローバルのスキルディレクトリへコピーしないでください。** ラッパーはリポジトリ内の実行コード・スクリプト・スキーマを相対パスで参照します。

## 解析モード

| モード | 用途と条件 |
| --- | --- |
| `host` | 対話利用の既定値。現在の Host が「準備 → 解析 → 確定処理」の受け渡しで解析します。 |
| `openai` | ユーザーが API 利用を明示的に選んだ場合のみ使用します。環境変数 `OPENAI_API_KEY` が必要です。 |
| `mock` | 自動テスト・CI・テストデータ用です。実際の学習レポートには使用しません。 |

プロバイダー間の自動フォールバックはありません。API キーが存在するだけでは OpenAI を選びません。**Host はローカルのオフライン LLM ではなく、CLI 単独では現在の Host モデルを呼び出せません。** 現行のプロバイダーに Ollama は含まれません。Sudachi は読みを補完し、文法説明・翻訳・学習レベルは判断しません。

### Host：準備・解析・確定処理

1. 処理する権限のあるファイルから、解析依頼を準備します。

```bash
node .agents/skills/multilingual-grammar-report-generator/scripts/run.mjs \
  --input "/absolute/path/to/subtitle.srt" \
  --analysis-provider host \
  --prepare-host \
  --explanation-language ja-JP \
  --output output/my-report
```

直接入力する場合は `--input ...` を `--text "日本語を勉強しています。"` に置き換えます。解説と訳は `zh-CN`（既定値）、`ja-JP`、`en` から選べます。

2. 現在の Host に次の 3 点を読ませ、要求された各文を解析し、スキーマに沿った JSON を `output/my-report/host-analysis-response.json` に保存させます。

- `output/my-report/host-analysis-request.json`
- `output/my-report/host-analysis-schema.json`
- [Host 解析の指示](.agents/skills/multilingual-grammar-report-generator/references/host-analysis.md)

この段階には、ローカルファイルを読み書きできる Host 自身による解析が必要です。準備コマンドだけで本物の解析結果が作成されるわけではありません。文 ID を保持し、各文法項目に例文を 1 文とその訳を付け、応答スキーマに従います。日本語のみの文と日本語語彙の読みは `null` にし、後段の決定的な補完処理に任せます。

3. **準備時と同じ出力ディレクトリ**で確定処理を行います。元の入力は渡し直しません。

```bash
node .agents/skills/multilingual-grammar-report-generator/scripts/run.mjs \
  --analysis-provider host \
  --finalize-host \
  --output output/my-report
```

検証と読み補完を経て、両形式のレポートが生成されます。`HOST_ANALYSIS_VALIDATION_FAILED` が返ったら、更新されたリクエストを読み、未完了 ID だけを Host に修正させて再度確定処理を行います。マニフェストが `retry-exhausted` になった場合は停止し、別のプロバイダーへ切り替えません。

スキルのラッパーでは、モード・処理段階を省略すると Host の準備が既定になります。下位の CLI から Host を使うには準備・確定の指定が必要で、指定しなければ `HOST_CONTEXT_REQUIRED` になります。

### OpenAI：明示的に API を選ぶ場合のみ

実行前に、シェルや Host の環境へ `OPENAI_API_KEY` を安全に設定してください。キーをコミットしたり、共有するコマンド・レポートに載せたりしないでください。[`.env.example`](.env.example) は設定項目の説明用です。**CLI は `.env` ファイルを自動では読み込みません。**

```bash
# OPENAI_API_KEY は、このシェルで安全に設定済みであること。
export OPENAI_API_KEY
node .agents/skills/multilingual-grammar-report-generator/scripts/run.mjs \
  --input "/absolute/path/to/subtitle.srt" \
  --analysis-provider openai \
  --model "<model-available-to-your-account>" \
  --explanation-language ja-JP \
  --output output/openai-report
```

モデルのプレースホルダーを、自分のアカウントで利用でき、必要な Responses API の構造化出力に対応するモデル ID へ置き換えてください。優先順は `--model`、`OPENAI_GRAMMAR_MODEL`、実装上の既定値 `gpt-5.6-sol` です。既定値の指定は利用可能性を保証しません。API モードでは選択した文章と文脈を送信し、料金が発生する場合があります。キーがなければ `MISSING_OPENAI_API_KEY` で停止します。

### Mock：動作確認のみ

```bash
npm run grammar-report -- \
  --text "日本語を勉強しています。" \
  --analysis-provider mock \
  --output output/mock-smoke
```

API や Host との受け渡しなしで処理経路を確認できます。**Mock は合成テストデータであり、本物の文法学習レポートではありません。** 独立した試行には新しい出力ディレクトリを使ってください。

## 出力と主なオプション

| ファイル | 内容 |
| --- | --- |
| `grammar-report.json` | 検証済みの文・翻訳・読み・文法・語彙・例文・時刻 |
| `grammar-report.md` | 閲覧用レポート。完全な構造化データは JSON に収録 |
| `sentences.json` | 再構成した文と元の字幕との対応 |
| `input-info.json`、`normalized-text.txt` | 入力情報と正規化したテキスト |
| `analysis-manifest.json`、`analysis-cache/` | 進捗・再試行状態と文単位のキャッシュ |
| `host-analysis-{request,schema,response}.json` | Host 用の受け渡しファイル。response は Host が作成 |

字幕の時刻を保持し、通常の文章の `start` と `end` は `null` にします。日本語のみの文と日本語の語彙の読みはバッチで補完します。複数言語が混在する文全体の読みや例文の読みは、この補完処理の対象外です。辞書・補完処理のバージョンをキャッシュ識別に含め、更新後に古い読みを再利用しないようにします。

```bash
npm run grammar-report -- --help
npm run typecheck
```

`--batch-size` は解析バッチあたりの文数（既定 8）、`--max-retries` は再試行回数（既定 2）、`--pause-threshold-seconds` は文を区切る字幕間の休止秒数（既定 1.2）です。`--host-response` で応答 JSON の別パスを指定できます。`--overwrite` は指定ディレクトリ内の生成ファイルを置き換えるため、意図した場合のみ使います。ディレクトリは同じ解析の継続時に再利用し、別の入力には別ディレクトリを使ってください。

## ソース構成

```text
.agents/skills/multilingual-grammar-report-generator/  スキル・参照資料・ラッパー
apps/cli/                                             文法レポート用 CLI
packages/grammar-report-core/                         解析とレポート生成
packages/shared/                                      共通スキーマ・ユーティリティ
packages/subtitle-core/                               字幕の解析・文の再構成
schemas/                                              レポート・字幕のデータ契約
scripts/                                              Sudachi 補完と依存定義
tests/                                                単体・結合テストとフィクスチャ
```

依存関係はロックファイルで固定します。`.gitignore` で出力、キャッシュ、仮想環境、認証情報、ビルド成果物、モデルの重み、メディアを除外しています。ただし、追跡済みのファイルを自動で無害化するものではありません。公開前にはステージされた変更を確認してください。

## トラブルシューティングと制約

- **導入に失敗する場合**：Node 24 系・npm 11 系を確認し、`npx --yes npm@11.18.0 ci` を再実行します。CLI の前に `npm run build` が必要です。別のチェックアウトの `node_modules` をコピーして代用しないでください。
- **Sudachi の導入に失敗する場合**：`python3`、`venv`、`pip`、ダウンロード先への接続を確認します。`SUDACHI_PYTHON` を使う場合は指定環境に固定バージョンを導入するか、指定を解除して `npm run setup:readings` を再実行します。
- **Host の検証に失敗する場合**：未完了 ID の依頼に従い、確定済みの文の再生成や穴埋めの解析を避けてください。[レポートの契約](.agents/skills/multilingual-grammar-report-generator/references/report-contract.md)も参照してください。
- **API エラーの場合**：明示的なモード選択、キー、モデルの利用権限を確認します。他のプロバイダーへのフォールバックはありません。
- **構造の検証と、言語学的な正しさは別です。** 短い字幕、話者の切り替わり、省略、固有名詞、未知語には人の確認が必要な場合があります。効果音や感嘆で空の文法配列は自然ですが、空配列が常に「分析すべき構造がない」ことを保証するわけではありません。
- JLPT（日本語）、HSK（中国語）、CEFR（英語）の表示は学習上の目安であり、公式認定ではありません。根拠が不足する場合は `unknown` / `unmapped` にします。

## 不具合報告とライセンス

[GitHub Issues](https://github.com/kai987/Codex-Skills-multilingual-grammar-report-generator/issues) に、利用権限のある最小限の再現文章、解析モード、期待する結果を記載してください。認証情報、個人情報、許可のない字幕・動画は添付しないでください。

[MIT License](LICENSE)。
