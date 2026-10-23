# Multilingual Grammar Report Generator

[English](README.md) | 日本語

日本語・中国語・英語、およびそれらが混在する文章や字幕から、学習用の文法レポートを作成する独立した Codex スキルです。各文法項目に自然なオリジナル例文を **1 文**とその訳を付け、JSON と Markdown で出力します。

## Codex へのインストール

組み込みのインストーラーを使うよう、Codex に依頼します。

```text
$skill-installer

kai987/Codex-Skills-multilingual-grammar-report-generator の main ブランチから、
.agents/skills/multilingual-grammar-report-generator をインストールしてください。
```

[インストール対象のフォルダ](.agents/skills/multilingual-grammar-report-generator) には、指示書・参照資料・起動スクリプト・実行コード・ロックファイルがすべて含まれています。別途リポジトリをクローンする必要はありません。

通常の保存先は `$CODEX_HOME/skills/multilingual-grammar-report-generator`、`CODEX_HOME` が未設定なら `~/.codex/skills/multilingual-grammar-report-generator` です。**次の Codex ターンから**、別のプロジェクトでも利用できます。古い同名スキルがある場合、インストーラーは上書きせず停止します。既存の導入先を確認してから再インストールしてください。`SKILL.md` だけをコピーしないでください。

システム側には **Node.js 24 系**と、**`venv`・`pip` が使える Python 3** が必要です。初回実行時に、ランチャーが `npm@11.18.0` でロック済みの Node 依存関係を導入し、同梱コードをビルドします。読み補完が初めて必要になる Host の確定処理・OpenAI 解析では、専用の Sudachi 環境も自動作成します。通常のスキル利用ではグローバルへのパッケージ導入や、手動の `npm ci`・ビルドは不要です。初回のセットアップにはネット接続が必要ですが、その後はソース・設定の変更がなければ導入済みの依存関係とビルドを再利用します。LLM やモデルの重みは不要です。

SudachiPy 0.6.11 と SudachiDict-core 20260428 は [依存定義](.agents/skills/multilingual-grammar-report-generator/runtime/scripts/requirements-sudachi.txt) に固定しています。初回は辞書を取得し、その後の読み補完はローカルで動きます。`SUDACHI_PYTHON` で既存環境を指定する場合も、この固定バージョンが必要です。

## 別の Codex プロジェクトで使う

作業対象のプロジェクトを Codex で開き、文章・字幕ファイルを添付して依頼します。

```text
$multilingual-grammar-report-generator

添付した日本語字幕を全文解析してください。
現在の Host モデルを使い、解説と訳は簡体字中国語にしてください。
各文法項目に日本語の例文を 1 文と中国語訳を付け、
このプロジェクトの output/my-report に保存してください。
```

Codex が入力を準備し、現在の Host が解析を書き、ランチャーが検証と読み補完を行います。指定先に `grammar-report.md` と `grammar-report.json` を生成します。Host モードに別途 OpenAI API キーは必要ありません。レポートと解析キャッシュは、導入済みスキルではなく呼び出し元プロジェクトの出力先に保存します。

コマンドを直接使う場合は、導入済み `SKILL.md` と同じフォルダのランチャーを指定します。標準の導入先なら次のとおりです。

```bash
GRAMMAR_SKILL_DIR="${CODEX_HOME:-$HOME/.codex}/skills/multilingual-grammar-report-generator"
node "$GRAMMAR_SKILL_DIR/scripts/run.mjs" --help
```

別の保存先へ導入した場合は、`GRAMMAR_SKILL_DIR` に実際のスキルの絶対パスを設定してください。どのプロジェクトからでも実行でき、相対指定した `--input`・`--output`・`--host-response` は実行時の作業ディレクトリを基準に解決します。内部の実行コードは、作業ディレクトリとは独立して導入先から解決します。

## 主な機能と公開範囲

- UTF-8 の TXT、SRT、VTT、ASS、SSA、および所定の形式に適合する字幕パッケージ JSON に対応します。任意の JSON を推測で読み込む機能ではありません。
- 字幕から文を再構成し、キュー ID、時刻、前後の文脈、確認用フラグを保持します。
- 接続・助詞・活用・条件・敬語・口語の縮約・省略を文脈に沿って説明します。
- 固定版の SudachiPy と `sudachidict_core` で日本語の読みを補完し、確定できない実質的な未知語の読みは `null` にします。
- 解析を Zod、最終レポートを JSON Schema で検証し、JSON と Markdown を出力します。
- 有効な解析を文単位でキャッシュし、未完了・検証失敗の文を再試行します。

コア実行コード、CLI、スキル、スキーマ、読み補完スクリプト、テストを収録しています。生成済みレポート、入力、キャッシュ、Python 仮想環境、導入済み依存関係、モデルの重み、メディアは公開物に含めません。音声認識、字幕の検索・取得、動画との同期確認、学習サイトの生成は対象外です。

## 解析モード

| モード | 用途と条件 |
| --- | --- |
| `host` | 対話利用の既定値。現在の Host が「準備 → 解析 → 確定処理」で解析します。 |
| `openai` | API 利用を明示的に選んだ場合のみ使用します。環境変数 `OPENAI_API_KEY` が必要です。 |
| `mock` | 自動テスト・CI・テストデータ用です。実際の学習レポートには使用しません。 |

プロバイダー間の自動フォールバックはありません。API キーが存在するだけでは OpenAI を選びません。**Host はローカルのオフライン LLM ではなく、CLI 単独では現在の Host モデルを呼び出せません。** Ollama は現行のプロバイダーに含まれません。Sudachi は読みを補完し、文法説明・翻訳・学習レベルは判断しません。

### Host：準備・解析・確定処理

通常はスキルを呼び出すと Codex がこの手順を実施します。コマンドで明示的に行う場合は、上記の `GRAMMAR_SKILL_DIR` を設定してから入力を準備します。

```bash
node "$GRAMMAR_SKILL_DIR/scripts/run.mjs" \
  --input "subtitles/episode.srt" \
  --analysis-provider host \
  --prepare-host \
  --explanation-language ja-JP \
  --output output/my-report
```

直接入力する場合は `--input ...` を `--text "日本語を勉強しています。"` に置き換えます。解説と訳は `zh-CN`（既定値）、`ja-JP`、`en` に対応します。

現在の Host は、出力先の `host-analysis-request.json`・`host-analysis-schema.json` と [Host 解析の指示](.agents/skills/multilingual-grammar-report-generator/references/host-analysis.md) を読み、要求された各文を解析して `output/my-report/host-analysis-response.json` を作成します。準備コマンドだけで解析内容が生成されるわけではありません。文 ID を保持し、各文法項目に例文を 1 文とその訳を付け、応答スキーマに従います。日本語のみの文と日本語語彙の読みは `null` にし、後段で補完します。

同じ作業ディレクトリから、**準備時と同じ出力ディレクトリ**を指定して確定処理を行います。元の入力は渡し直しません。

```bash
node "$GRAMMAR_SKILL_DIR/scripts/run.mjs" \
  --analysis-provider host \
  --finalize-host \
  --output output/my-report
```

検証と読み補完を経て両形式のレポートを生成します。`HOST_ANALYSIS_VALIDATION_FAILED` が返ったら、更新されたリクエストを読み、未完了 ID だけを Host に修正させて再度確定処理を行います。マニフェストが `retry-exhausted` になった場合は停止し、別のプロバイダーへ切り替えません。

ランチャーでは、モード・処理段階を省略すると Host の準備が既定になります。下位の CLI から Host を使うには準備・確定の指定が必要で、指定しなければ `HOST_CONTEXT_REQUIRED` になります。

### OpenAI：明示的に API を選ぶ場合のみ

実行前に、シェルや Host の環境へ `OPENAI_API_KEY` を安全に設定してください。CLI は `.env` ファイルを自動では読み込みません。[設定例](.agents/skills/multilingual-grammar-report-generator/runtime/.env.example) は利用できる環境変数の説明用です。

```bash
# OPENAI_API_KEY は、このシェルで安全に設定済みであること。
export OPENAI_API_KEY
node "$GRAMMAR_SKILL_DIR/scripts/run.mjs" \
  --input "subtitles/episode.srt" \
  --analysis-provider openai \
  --model "<model-available-to-your-account>" \
  --explanation-language ja-JP \
  --output output/openai-report
```

必要な Responses API の構造化出力に対応し、自分のアカウントで利用できるモデル ID を指定します。優先順は `--model`、`OPENAI_GRAMMAR_MODEL`、実装上の既定値 `gpt-5.6-sol` です。既定値の指定は利用可能性を保証しません。API モードでは選択した文章と文脈を送信し、料金が発生する場合があります。キーがなければ `MISSING_OPENAI_API_KEY` で停止します。認証情報をコミットしたり、レポートに記載したりしないでください。

### Mock：動作確認のみ

```bash
node "$GRAMMAR_SKILL_DIR/scripts/run.mjs" \
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

字幕の時刻を保持し、通常の文章の `start` と `end` は `null` にします。日本語のみの文と日本語語彙の読みはバッチで補完します。混在言語の文全体の読みや例文の読みは、この補完処理の対象外です。辞書・補完処理のバージョンをキャッシュ識別に含め、更新後に古い読みを再利用しないようにします。

`--batch-size` は解析バッチあたりの文数（既定 8）、`--max-retries` は再試行回数（既定 2）、`--pause-threshold-seconds` は文を区切る字幕間の休止秒数（既定 1.2）です。`--host-response` で応答 JSON の別パスを指定できます。`--overwrite` は指定先の生成ファイルを置き換えるため、意図した場合のみ使います。出力先は同じ解析の継続時に再利用し、別の入力には別ディレクトリを使ってください。

## ソースを開発する場合

スキル・実行コードを変更する場合はリポジトリをクローンします。インストール対象のスキルフォルダ自体が実体であり、公開用に別途コピーする工程は不要です。ルートの開発コマンドは同梱の実行環境へ転送されます。

```bash
git clone https://github.com/kai987/Codex-Skills-multilingual-grammar-report-generator.git
cd Codex-Skills-multilingual-grammar-report-generator
npm run bootstrap
npm test
npm run typecheck
npm run grammar-report -- --help
```

`npm run bootstrap` はロック済みの依存関係を導入し、実行コードをビルドします。ソース変更後の再ビルドには `npm run build` を使います。

```text
.agents/skills/multilingual-grammar-report-generator/
  SKILL.md, references/        スキルの指示・レポートのデータ契約
  LICENSE                     スキル単独の導入時にも保持するライセンス
  scripts/                    初期設定・起動・読み補完環境の設定
  runtime/
    apps/cli/                 文法レポート用 CLI
    packages/                 解析処理・共通処理・字幕処理
    schemas/                  レポート・字幕のデータ契約
    scripts/                  Sudachi 補完・固定バージョンの依存定義
    tests/                    単体・結合テストとフィクスチャ
    package.json, package-lock.json, tsconfig.json
package.json                  開発コマンドの転送
```

実行環境の依存関係はロックファイルで固定します。`.gitignore` で出力、キャッシュ、仮想環境、認証情報、ビルド成果物、モデルの重み、メディアを除外しています。ユーザーのデータを公開しないよう、ステージされた変更を確認してください。

## トラブルシューティングと制約

- **初回設定に失敗する場合**：Node 24 系と正常に動く Node/npm 環境を確認し、同じランチャーを再実行します。初期設定の失敗時はエラーを返し、別の解析モードへ切り替えません。依存関係や固定 npm 版を取得できない場合はネット接続も確認します。
- **Sudachi の導入に失敗する場合**：`python3`、`venv`、`pip`、ダウンロード先への接続を確認します。`SUDACHI_PYTHON` を使う場合は指定環境に固定版を導入するか、指定を解除してランチャーに専用環境を管理させてください。
- **パスについて**：読み込まれた `SKILL.md` の隣にあるランチャーを指定します。別プロジェクト内の `.agents/skills/...` という相対パスは、グローバルに導入したスキルを指しません。相対指定の入力・出力は現在のプロジェクトを基準にしてください。
- **Host の検証に失敗する場合**：未完了 ID の依頼に従い、確定済みの文の再生成や穴埋めの解析を避けます。[レポートの契約](.agents/skills/multilingual-grammar-report-generator/references/report-contract.md) も参照してください。
- **API エラーの場合**：明示的なモード選択、キー、モデルの利用権限を確認します。他のプロバイダーへのフォールバックはありません。
- **構造の検証と、言語学的な正しさは別です。** 短い字幕、話者の切り替わり、省略、固有名詞、未知語には人の確認が必要な場合があります。効果音や感嘆で空の文法配列は自然ですが、空配列が常に「分析すべき構造がない」ことを保証するわけではありません。
- JLPT・HSK・CEFR の表示は学習上の目安であり、公式認定ではありません。根拠が不足する場合は `unknown` / `unmapped` にします。

## 不具合報告とライセンス

[GitHub Issues](https://github.com/kai987/Codex-Skills-multilingual-grammar-report-generator/issues) に、利用権限のある最小限の再現文章、解析モード、期待する結果を記載してください。認証情報、個人情報、許可のない字幕・動画は添付しないでください。

[MIT License](LICENSE)。
