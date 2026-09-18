export type GuideBlock =
  | { type: "p"; text: string }
  | { type: "note"; text: string }
  | { type: "warn"; text: string }
  | { type: "code"; text: string }
  | { type: "imgs"; files: string[]; caption?: string };

export interface GuideStep {
  n: string;
  title: string;
  blocks: GuideBlock[];
}

export interface GuideSection {
  id: string;
  title: string;
  intro?: string;
  steps: GuideStep[];
}

export interface GuideDoc {
  id: string;
  title: string;
  summary: string;
  updated: string;
  sections: GuideSection[];
}

export const GUIDES: { id: string; title: string; summary: string }[] = [
  {
    id: "whlk",
    title: "BIOS WHLK（WU）",
    summary: "測試機準備、HLK 跑測、常見失敗，到 Driver Sign、上傳 Microsoft 與 Pre WU。",
  },
];

export const WHLK_GUIDE: GuideDoc = {
  id: "whlk",
  title: "BIOS WHLK（WU）",
  summary: "BIOS Windows Update 的 WHLK 教學，含測試機／Server 機步驟與常見失敗。",
  updated: "2026-09",
  sections: [
    {
      id: "dut",
      title: "測試機準備",
      intro: "先把 DUT 環境清乾淨、MT code 對上、開 Test Mode，再刷正確 BIOS，最後裝 HLK Client。",
      steps: [
        {
          n: "1",
          title: "關閉干擾與螢幕休眠",
          blocks: [
            { type: "p", text: "關閉防火牆、關閉 UAC、解除安裝 McAfee。電源計畫把 Turn off the display 與 Put the computer to sleep 都設成 Never。" },
            { type: "imgs", files: ["image001.jpg"], caption: "Edit Plan Settings：螢幕與睡眠皆為 Never" },
          ],
        },
        {
          n: "2",
          title: "核對 System Model / MT code",
          blocks: [
            { type: "p", text: "在系統資訊確認 System Model 與 SMBIOS Type 1 Product Name，必須與 WUFU 那包 .inf 裡的 MT code 一致。" },
            { type: "imgs", files: ["image002.jpg"], caption: "msinfo32：System Model 需與 WUFU inf 的 MT code 相同" },
          ],
        },
        {
          n: "3",
          title: "開啟 Test Mode",
          blocks: [
            { type: "p", text: "系統管理員開啟命令提示字元，執行後重開機，確認桌面浮水印已進入 Test Mode。" },
            { type: "code", text: "bcdedit -set testsigning on" },
            { type: "imgs", files: ["image003.jpg", "image004.jpg"], caption: "管理員命令列開啟 testsigning，重開後應看到 Test Mode" },
          ],
        },
        {
          n: "4",
          title: "WUFU 刷正確 BIOS",
          blocks: [
            { type: "p", text: "裝置管理員找到 Firmware → System firmware，依下圖逐步更新到這次要測的 BIOS。" },
            {
              type: "imgs",
              files: [
                "image005.jpg", "image006.jpg", "image007.jpg", "image008.jpg", "image009.jpg",
                "image010.jpg", "image011.jpg", "image012.jpg", "image013.jpg", "image014.jpg",
              ],
              caption: "裝置管理員：Firmware / System firmware 更新流程",
            },
          ],
        },
        {
          n: "5",
          title: "確認 Firmware 顯示",
          blocks: [
            { type: "p", text: "重複步驟 4 後，裝置管理員 → Firmware 應出現對應的 Lenovo UEFI System Firmware 版本（如下圖紅框）。" },
            { type: "imgs", files: ["image015.jpg"], caption: "正確時會看到 Lenovo UEFI System Firmware 版本列" },
          ],
        },
        {
          n: "6",
          title: "接到與虛擬機同一網段",
          blocks: [
            { type: "p", text: "連實驗室 WLAN（DQA-21870BGN 或 dlink），或用網線與虛擬機接同一台路由器。Wi-Fi 密碼以實驗室標示為準。" },
          ],
        },
        {
          n: "7",
          title: "連到 Server 機分享",
          blocks: [
            { type: "p", text: "Win + R，輸入 Server 機（虛擬機）當下的 IPv4，例如：\\\\192.168.0.197。以虛擬機實際 IP 為準。" },
            { type: "imgs", files: ["image016.jpg", "image017.jpg", "image018.jpg"], caption: "執行 \\伺服器IP，登入後應看到分享資料夾" },
          ],
        },
        {
          n: "8",
          title: "安裝 HLK Client",
          blocks: [
            { type: "p", text: "系統管理員執行 Client 安裝腳本。" },
            { type: "code", text: "\\\\192.168.0.2\\HLKInstall\\Client\\Setup.cmd" },
            { type: "note", text: "路徑上的 IP 以實驗室 HLK 安裝分享為準，不一定是 192.168.0.2。" },
            { type: "imgs", files: ["image019.jpg"], caption: "以系統管理員執行 HLK Client Setup.cmd" },
          ],
        },
      ],
    },
    {
      id: "server",
      title: "Server 機（Hyper-V / HLK）",
      intro: "在虛擬機開 HLK Studio，建 Machine Pool、建專案、載入 playlist 後跑測，再打包 .hlkx。",
      steps: [
        {
          n: "1",
          title: "連進 HLK 虛擬機",
          blocks: [
            { type: "p", text: "開啟 Hyper-V 管理員，連線名稱為 HHH 的虛擬機，用 Administrator 登入。密碼請用實驗室標示的帳密。" },
            { type: "imgs", files: ["image020.jpg", "image021.jpg", "image022.jpg"], caption: "Hyper-V 連到 HHH，登入 Administrator" },
          ],
        },
        {
          n: "2",
          title: "打開 Job Monitor",
          blocks: [
            { type: "p", text: "開啟 HLK Manager → Explorers → Job Monitor。" },
            { type: "imgs", files: ["image023.jpg"], caption: "HLK Manager：Job Monitor" },
          ],
        },
        {
          n: "3",
          title: "新增 Machine Pool",
          blocks: [
            { type: "p", text: "在 $ 上按右鍵 → Add Machine Pool，輸入 Pool 名稱。" },
            { type: "imgs", files: ["image024.jpg"], caption: "Add Machine Pool" },
          ],
        },
        {
          n: "4",
          title: "Reset Default Pool 裡的測試機",
          blocks: [
            { type: "p", text: "在 Default Pool 確認已辨識到測試機名稱。對 Status 按右鍵改成 Reset，再按 Refresh，等到狀態變成 Ready。" },
            { type: "imgs", files: ["image025.jpg", "image026.jpg"], caption: "Default Pool：Reset 後 Refresh 到 Ready" },
          ],
        },
        {
          n: "5",
          title: "把測試機拖進專案 Pool",
          blocks: [
            { type: "p", text: "將測試機從 Default Pool 拖到新建的 Pool（文件範例為 LLS5I_V31_2，實際名稱依專案）。" },
            { type: "imgs", files: ["image027.jpg"], caption: "從 Default Pool 拖到專案 Pool" },
          ],
        },
        {
          n: "6",
          title: "建立 HLK 專案",
          blocks: [
            { type: "p", text: "開啟 Visual Studio → Windows Hardware Lab Kit → Create project，輸入專案名稱。" },
            { type: "imgs", files: ["image028.jpg"], caption: "HLK Studio：Create Project" },
          ],
        },
        {
          n: "7",
          title: "Selection 勾選 Firmware",
          blocks: [
            { type: "p", text: "點 Selection，選剛才的 Machine Pool，勾選辨識到的測試機 firmware 版本。" },
            { type: "imgs", files: ["image029.jpg"], caption: "Selection：勾選對應 firmware" },
          ],
        },
        {
          n: "8",
          title: "載入 Playlist",
          blocks: [
            { type: "p", text: "點 Tests → Load playlist。" },
            { type: "imgs", files: ["image030.jpg"], caption: "Tests：Load Playlist" },
          ],
        },
        {
          n: "9",
          title: "全選並 Run Selected",
          blocks: [
            { type: "p", text: "點 Status 全選測試項目，再按 Run Selected。" },
            { type: "imgs", files: ["image031.jpg", "image032.jpg"], caption: "全選測試項後 Run Selected" },
          ],
        },
        {
          n: "10",
          title: "Secure Boot 後重跑三個 X",
          blocks: [
            { type: "p", text: "跑完後通常會看到三個 X。到測試機啟用 Secure Boot，再勾這三項 rerun。重跑後剩下兩個 X 才是這關的 pass 狀態。" },
            { type: "imgs", files: ["image033.jpg", "image034.jpg", "image035.jpg"], caption: "先三個 X → 開 Secure Boot 重跑 → 兩個 X 為 pass" },
          ],
        },
        {
          n: "11",
          title: "套用 Results 篩選",
          blocks: [
            { type: "p", text: "點 Results → Apply Filters，收集結果。" },
            { type: "imgs", files: ["image036.jpg"], caption: "Results：Apply Filters" },
          ],
        },
        {
          n: "12",
          title: "加入要測的 WU 包",
          blocks: [
            { type: "p", text: "點 Package → Add Driver Folder，選這次要測的 WU 資料夾。" },
            { type: "imgs", files: ["image037.jpg"], caption: "Package：Add Driver Folder" },
          ],
        },
        {
          n: "13",
          title: "勾選 Products 與 Locales",
          blocks: [
            { type: "p", text: "在 Driver Properties 勾選 Products 與 Locales。" },
            { type: "imgs", files: ["image038.jpg", "image039.jpg"], caption: "Driver Properties：Products、Locales" },
          ],
        },
        {
          n: "14",
          title: "Create Package",
          blocks: [
            { type: "p", text: "執行 Create Package，產出 .hlkx。" },
            { type: "imgs", files: ["image040.jpg", "image041.jpg", "image042.jpg"], caption: "Create Package 產出 hlkx" },
          ],
        },
      ],
    },
    {
      id: "issues",
      title: "常見問題",
      intro: "Create Package 失敗時，先對時間與多餘 Firmware 裝置。",
      steps: [
        {
          n: "A",
          title: "Create fail #1：Signability tests",
          blocks: [
            { type: "p", text: "錯誤視窗：Package creation stopped due to Drivers failing Signability tests。" },
            { type: "imgs", files: ["image043.jpg"], caption: "HLK Error：Drivers failing Signability tests" },
            { type: "note", text: "解法：Server 機時間太舊，與北京時間不一致。改成一致後再 Create 就會過。" },
          ],
        },
        {
          n: "B",
          title: "Create fail #2：多餘 System Firmware",
          blocks: [
            { type: "p", text: "測試項出現 DF - Firmware Package Installation Test 等紅 X。Log 常見 There must not be more than a single system firmware resource exposed。" },
            { type: "imgs", files: ["image044.jpg", "image045.jpg"], caption: "Firmware Package Installation Test 失敗，log 顯示多個 firmware resource" },
            { type: "p", text: "解法：測試機裝置管理員顯示隱藏裝置，把多餘的 System Firmware 刪掉後重跑。" },
            { type: "imgs", files: ["image046.jpg"], caption: "裝置管理員 Firmware 下有多餘 Device Firmware / System Firmware 時需清掉" },
          ],
        },
      ],
    },
    {
      id: "sign",
      title: "Driver Sign",
      steps: [
        {
          n: "15",
          title: "送簽 .hlkx",
          blocks: [
            { type: "p", text: "把存好的 .hlkx 送到 Driver Sign 內網頁面。" },
            { type: "code", text: "http://tpesa9sps:8080/driversign/index" },
            { type: "imgs", files: ["image047.jpg", "image048.jpg", "image049.jpg"], caption: "內網 Driver Sign 上傳 hlkx" },
          ],
        },
        {
          n: "16",
          title: "等 Pending 變 Success",
          blocks: [
            { type: "p", text: "狀態從 Pending 變成 Success 後，點 Success 下載簽好的檔。成功時也會收到郵件。" },
            { type: "imgs", files: ["image050.jpg"], caption: "Driver Sign：Pending → Success 後下載" },
          ],
        },
      ],
    },
    {
      id: "msft",
      title: "上傳 Microsoft Hardware Dashboard",
      intro: "用 Edison 的 Microsoft 硬體儀表板帳號上傳。密碼會過期，請向專案窗口索取最新密碼，登入驗證碼用 OTP。",
      steps: [
        {
          n: "17",
          title: "登入儀表板",
          blocks: [
            { type: "p", text: "將 Driver Sign 後的檔案送到 Microsoft Hardware Dashboard。" },
            { type: "code", text: "https://developer.microsoft.com/en-us/dashboard/hardware" },
            { type: "note", text: "帳號：edison_cheng@compalelectronicsinc.onmicrosoft.com。密碼會變，請向 Edison／專案窗口索取，不要把密碼寫進文件或聊天。Enter code 用 OTP 產生器。" },
            { type: "imgs", files: ["image051.jpg", "image052.jpg"], caption: "OTP 產生 Enter code 後登入" },
          ],
        },
        {
          n: "17b",
          title: "對照上一版上傳",
          blocks: [
            { type: "p", text: "登入後可搜尋本專案上一版。例如 LLS5I 用專案前四碼 STCN，點藍色編號可看上傳細節。" },
            { type: "imgs", files: ["image053.jpg"], caption: "搜尋專案前四碼可找到歷史上傳" },
          ],
        },
        {
          n: "17c",
          title: "Submit new hardware",
          blocks: [
            { type: "p", text: "點 Submit new hardware，對照上一版內容上傳 Driver Sign 後的 hlkx。" },
            { type: "imgs", files: ["image054.jpg", "image055.jpg", "image056.jpg"], caption: "Submit new hardware 並上傳 hlkx" },
          ],
        },
        {
          n: "17d",
          title: "填 Product name 與 Version",
          blocks: [
            { type: "p", text: "輸入 Product name、填 Version，最後按 Submit。" },
            { type: "imgs", files: ["image057.jpg", "image058.jpg", "image059.jpg", "image060.jpg"], caption: "Product name、Version、Submit" },
          ],
        },
        {
          n: "17e",
          title: "看 Manual review 與 Shared product ID",
          blocks: [
            { type: "warn", text: "上傳後盯 Manual review。若打叉，需要重新上傳或 WHLK 重測。" },
            { type: "imgs", files: ["image061.jpg"], caption: "Manual review 狀態" },
            { type: "p", text: "後續 Pre WU 會用到 Shared product ID，請一併記下。" },
            { type: "imgs", files: ["image062.jpg"], caption: "Shared product ID" },
          ],
        },
      ],
    },
    {
      id: "prewu",
      title: "Pre WU shipping label",
      intro: "上傳走到 Finalize 後就可做 Pre WU shipping label。量產後每一版是否都要上傳，依各案子定義。",
      steps: [
        {
          n: "18",
          title: "等 Finalize 後開新 Label",
          blocks: [
            { type: "p", text: "等硬體提交走到 Finalize，到頁面最底點 New shipping label。" },
            { type: "imgs", files: ["image063.jpg", "image064.jpg"], caption: "Finalize 後 New shipping label" },
          ],
        },
        {
          n: "18b",
          title: "對照上一版 Test Key 與版本",
          blocks: [
            { type: "p", text: "參照上一版 Pre WU 的 test key 填寫，並填對應版本。" },
            { type: "imgs", files: ["image065.jpg", "image066.jpg"], caption: "依上一版 test key 與版本填寫" },
          ],
        },
        {
          n: "18c",
          title: "選 Lenovo 帳號",
          blocks: [
            { type: "p", text: "輸入 lenovo，等清單載入後選 29997810-lenovo。" },
            { type: "imgs", files: ["image067.jpg", "image068.jpg", "image069.jpg", "image070.jpg"], caption: "搜尋並選擇 29997810-lenovo" },
          ],
        },
        {
          n: "18d",
          title: "Publish 並 Include Test Registry key",
          blocks: [
            { type: "p", text: "拉到最右邊點 Publish。選 Test Registry key，點 Include，最後再 Publish 上傳。" },
            { type: "imgs", files: ["image071.jpg", "image072.jpg", "image073.jpg", "image074.jpg", "image075.jpg"], caption: "Publish → Include Test Registry key → 再 Publish" },
          ],
        },
        {
          n: "18e",
          title: "追進度",
          blocks: [
            { type: "p", text: "之後可查看 Pre WU shipping label 進度。等走到 Finalize，就可以測 Pre WU list。" },
            { type: "imgs", files: ["image077.jpg"], caption: "Pre WU shipping label 進度" },
          ],
        },
      ],
    },
  ],
};
