# 배낭공방 UI 이미지 레퍼런스

인터넷에서 찾은 화면과 에셋 중, 실제 게임에는 라이선스가 명확한 CC0 자료만 후보로 사용한다. 상용 게임 화면과 Shattered Pixel Dungeon 자료는 레이아웃 연구용이며 그대로 복제하지 않는다.

## 1. Shattered Pixel Dungeon

- 용도: 필드 탐사 격자와 상태 정보를 분리하는 정보 위계 참고. 이동 방식은 현재 가로 화면 고정 조이스틱으로 변경
- 출처: https://github.com/00-Evan/shattered-pixel-dungeon
- 라이선스: GPL-3.0. 직접 가져오기보다 조작 흐름과 화면 구성만 참고

## 2. MELLE Fantasy GUI

![MELLE Fantasy GUI](https://opengameart.org/sites/default/files/styles/medium/public/GUI%20Vorschau%201.png)

- 용도: 가방 창, 아이템 상세 카드, 연구 패널의 질감 참고
- 출처: https://opengameart.org/content/fantasy-gui-0
- 라이선스: CC0
- 판단: 장식성이 강하므로 프레임을 단순화하고 황동·가죽 팔레트로 재가공하는 편이 적합

## 3. Buch Sci-fi User Interface

![Buch Sci-fi User Interface](https://opengameart.org/sites/default/files/styles/medium/public/ui_gold_preview.png)

- 용도: 폐역 장치, 체력 바, 측량탑·지도 범례의 픽셀 프레임 참고
- 출처: https://opengameart.org/content/sci-fi-user-interface
- 라이선스: CC0
- 판단: 현재 배낭공방의 황동·검은 철도 분위기와 가장 잘 맞는 후보

## 4. Kenney Fantasy UI Borders

![Kenney Fantasy UI Borders](https://opengameart.org/sites/default/files/styles/medium/public/sample_116.png)

- 용도: 팝업, 전체 지도, 가방 패널에 쓰는 9-slice 테두리 참고
- 출처: https://opengameart.org/content/fantasy-ui-borders
- 라이선스: CC0, 출처 표기 선택 사항
- 판단: 가독성이 좋아 실제 프로토타입 적용 후보로 적합하나 픽셀 느낌은 별도로 보강해야 함

## 추천 조합

- 기본 화면 구조: Shattered Pixel Dungeon의 지도 우선 정보 위계
- 패널과 체력 바: Buch Sci-fi UI의 황동 픽셀 프레임
- 가방과 팝업 테두리: Kenney Fantasy UI Borders를 어둡게 재색상
- 장식 밀도: MELLE Fantasy GUI의 약 30% 수준만 사용

## 5. 계층형 전략 지도 참고

- 참고 화면: 사용자가 제공한 로드 오브 던전 계열 필드 지도와 대륙·군현 지도 화면
- 적용 원칙: `대륙 전체 → 지역 확대 → 하위 필드 → 현장`으로 한 단계씩 확대하고, 지도 노드는 직접 눌러 선택
- 운영 기능: 하단에 길게 쌓지 않고 생활권·원정대·생태는 왼쪽, 물류·외교·보고는 오른쪽 접이식 메뉴로 이동
- 현장 노드: 광산·야생 동굴·숨겨진 던전·폐작업장·약초밭을 지도 위에 배치하고 점령 전에는 진입, 점령 후에는 토벌·조사·개발로 분기
- 저작권 처리: 제공된 상용 게임 화면은 구조 연구에만 사용하고, 실제 배경은 프로젝트용 원본 이미지 `frontier-region-map-v1.png`, `frontier-site-map-v1.png`로 별도 제작
