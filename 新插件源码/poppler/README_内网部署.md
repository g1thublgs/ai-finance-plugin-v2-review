# Poppler 内网部署说明

本文件夹是场景化重构插件专用的独立 Poppler 运行目录。请将整个 `poppler` 文件夹复制到内网服务器 D 盘根目录，最终路径应为：

```text
D:\poppler
```

复制后必须保持以下目录结构：

```text
D:\poppler\Library\bin\pdftoppm.exe
D:\poppler\Library\bin\pdfinfo.exe
D:\poppler\share\poppler\cidToUnicode\Adobe-GB1
D:\poppler\share\poppler\cMap\Adobe-GB1
D:\poppler\fonts
```

插件后端已默认读取：

```text
PDFTOPPM_PATH = D:\poppler\Library\bin\pdftoppm.exe
PDFINFO_PATH  = D:\poppler\Library\bin\pdfinfo.exe
POPPLER_DATADIR = D:\poppler\share\poppler
POPPLER_FONTDIR = D:\poppler\fonts
OCR 临时目录 = D:\ai_finance_plugin_tmp\ocr
```

如果新版火车票 PDF 渲染后仍缺中文站名或人名，请在内网服务器上把系统中文字体复制到：

```text
D:\poppler\fonts
```

建议至少放入以下字体之一：

```text
simsun.ttc
msyh.ttc
simhei.ttf
arialuni.ttf
```

这些字体通常在服务器：

```text
C:\Windows\Fonts
```

完成后进入后端目录运行自检：

```bat
cd /d 新插件路径\backend
npm run check:poppler
```

自检结果中以下项目应为 `ok: true`：

```text
pdftoppm.exe
pdfinfo.exe
POPPLER_DATADIR
Adobe-GB1 cidToUnicode
Adobe-GB1 CMap
OCR temp dir
Poppler root no Chinese path
```

注意：不要把 Poppler 放在含中文、空格或特殊字符的路径下。新版火车票这类文字型 PDF 对 Poppler 的中文 CMap 和字体路径较敏感，路径异常会导致 OCR 前的图片已经丢失中文。
