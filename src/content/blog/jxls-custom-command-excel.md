---
title: 'Jxls에서 반복문과 셀 병합을 동시에 처리하는 커스텀 커맨드'
description: 'Jxls의 기본 커맨드로는 반복 처리 중 셀 병합이 안 된다. 계층 구조 데이터를 엑셀로 출력하면서 상위 항목 셀을 자동 병합하는 EachMergeCommand를 만들어 해결했다.'
pubDate: 2019-09-15
category: 'spring'
tags: ['jxls', 'excel', 'java', 'custom-command']
draft: false
---

## 문제

엑셀 보고서를 만들어야 하는데 계층 구조 데이터였다. 회사 → 부서 → 직원 같은 형태로 상위 항목 셀은 병합되고 그 아래에 하위 항목들이 나열되는 구조다. 엑셀에서 흔히 보는 패턴이다.

```
| 회사   | 부서   | 직원   |
|--------|--------|--------|
|        | 개발팀 | 김XX   |
| A사    |        | 이XX   |
|        | 기획팀 | 박XX   |
|--------|--------|--------|
| B사    | 개발팀 | 최XX   |
```

Jxls를 쓰고 있었는데 기본 `jx:each` 커맨드로는 반복 처리와 셀 병합을 동시에 할 수가 없었다. 반복은 되지만 "같은 회사에 속한 행들의 회사 셀을 병합해라" 같은 처리가 불가능하다. Jxls 공식 문서에도 이런 케이스에 대한 가이드가 없어서 커스텀 커맨드를 직접 만들었다.

---

## 해결 — EachMergeCommand

`EachCommand`를 상속해서 반복 처리가 끝날 때마다 셀 병합을 자동으로 수행하는 `EachMergeCommand`를 만들었다. 핵심은 `AreaListener`를 활용하는 것이다. 각 셀이 렌더링될 때 리스너가 호출되는데 이 시점에 같은 값을 가진 셀들의 범위를 추적해서 병합한다.

### EachMergeCommand

```java
import org.jxls.area.Area;
import org.jxls.command.EachCommand;
import org.jxls.common.CellRef;
import org.jxls.common.Context;
import org.jxls.common.Size;

import java.util.List;
import java.util.stream.Collectors;

public class EachMergeCommand extends EachCommand {
    public static final String COMMAND_NAME = "each-merge";

    @Override
    public Size applyAt(CellRef cellRef, Context context) {
        List<Area> childAreas = this.getAreaList().stream()
                .flatMap(area -> area.getCommandDataList().stream())
                .flatMap(commandData -> commandData.getCommand().getAreaList().stream())
                .collect(Collectors.toList());

        MergeAreaListener listener = new MergeAreaListener(this.getTransformer(), cellRef);
        this.getAreaList().get(0).addAreaListener(listener);
        childAreas.forEach(childArea -> childArea.addAreaListener(listener));

        return super.applyAt(cellRef, context);
    }
}
```

`applyAt`을 오버라이드해서 부모 영역과 자식 영역 모두에 `MergeAreaListener`를 등록한다. 중첩된 `each-merge` 커맨드가 있어도 병합이 동작하도록 자식 영역까지 탐색한다.

### MergeAreaListener

```java
import org.apache.poi.ss.util.CellRangeAddress;
import org.jxls.common.AreaListener;
import org.jxls.common.CellRef;
import org.jxls.common.Context;
import org.jxls.transform.Transformer;
import org.jxls.transform.poi.PoiTransformer;
import org.apache.poi.ss.usermodel.Sheet;

public class MergeAreaListener implements AreaListener {
    private final CellRef commandCell;
    private final Sheet sheet;
    private CellRef lastRowCellRef;

    public MergeAreaListener(Transformer transformer, CellRef cellRef) {
        this.commandCell = cellRef;
        this.sheet = ((PoiTransformer) transformer).getXSSFWorkbook().getSheet(cellRef.getSheetName());
    }

    @Override
    public void afterApplyAtCell(CellRef cellRef, Context context) {
        if (commandCell.getCol() != cellRef.getCol()) {
            this.setLastRowCellRef(cellRef);
        } else {
            if (!existMerged(cellRef)) merge(cellRef);
        }
    }

    private void merge(CellRef cellRef) {
        if (lastRowCellRef == null) return;
        int from = cellRef.getRow();
        int to = lastRowCellRef.getRow();
        sheet.addMergedRegion(new CellRangeAddress(from, to, cellRef.getCol(), cellRef.getCol()));
    }

    private void setLastRowCellRef(CellRef cellRef) {
        if (lastRowCellRef == null || lastRowCellRef.getRow() < cellRef.getRow()) {
            this.lastRowCellRef = cellRef;
        }
    }

    private boolean existMerged(CellRef cell) {
        return sheet.getMergedRegions().stream()
                .anyMatch(address -> address.isInRange(cell.getRow(), cell.getCol()));
    }
}
```

리스너의 동작 원리는 이렇다.

1. 커맨드가 위치한 컬럼과 **다른** 컬럼의 셀이 렌더링되면 마지막 행 위치를 갱신한다
2. 커맨드가 위치한 컬럼과 **같은** 컬럼의 셀이 렌더링되면 시작행부터 마지막 행까지 병합한다
3. 이미 병합된 영역이면 중복 병합을 건너뛴다

---

## 사용 방법

### 커맨드 등록

```java
XlsCommentAreaBuilder.addCommandMapping(EachMergeCommand.COMMAND_NAME, EachMergeCommand.class);
```

### 엑셀 템플릿

기존 `jx:each` 대신 `jx:each-merge`를 사용한다. 템플릿 주석에 커맨드를 지정하는 것 외에 다른 변경은 없다.

### ExcelGenerator

```java
public class ExcelGenerator {
    private final String templatePath;
    private final Context context;

    public ExcelGenerator(String templatePath) {
        this.templatePath = templatePath;
        this.context = new Context();
        XlsCommentAreaBuilder.addCommandMapping(EachMergeCommand.COMMAND_NAME, EachMergeCommand.class);
    }

    public void addMappingValue(String varName, Object value) {
        this.context.putVar(varName, value);
    }

    public void generate(String outputPath) {
        try (InputStream is = this.getClass().getClassLoader().getResourceAsStream(templatePath);
             OutputStream os = new FileOutputStream(outputPath)) {
            JxlsHelper.getInstance().processTemplate(is, os, this.context);
        } catch (IOException e) {
            throw new RuntimeException("Template processing error", e);
        }
    }
}
```

---

## 참고

- [Jxls Documentation](http://jxls.sourceforge.net/)
- [예제 소스 코드](https://github.com/samhyun/jxls-each-merge-example)