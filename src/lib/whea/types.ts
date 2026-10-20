/** One analyzed WHEA row for grid + reports (mirrors PS1 Analyze-WheaEvent fields used in UI). */
export type WheaRow = {
  time: string;
  eventId: number;
  recordId: string;
  levelName: string;
  category: string;
  location: string;
  vidDid: string;
  keyData: string;
  headerLog: string;
  tlp: string;
  target: string;
  decoded: string;
  // Extra for TXT/HTML reports
  vendorId: string;
  deviceId: string;
  primaryDevice: string;
  ues: string;
  ces: string;
  headerDwords: string;
  requester: string;
  requesterAri: string;
  targetAri: string;
  configOffset: string;
  address: string;
  eventMessage: string;
  errorSource: string;
  errorType: string;
  apicId: string;
  mcaBank: string;
  mciStat: string;
  mciMcaCode: string;
  mciExtCode: string;
  mciFlags: string;
  mciAddr: string;
  mciMisc: string;
  physicalAddress: string;
  physicalAddressMask: string;
  node: string;
  card: string;
  module: string;
  memoryBank: string;
  memoryDevice: string;
  row: string;
  column: string;
  bitPosition: string;
  rawData: string;
  rawDataBytes: number;
  rawDataSignature: string;
};

export type WheaAnalyzeResult = {
  sourceName: string;
  jobId: string;
  scanned: number;
  rows: WheaRow[];
  withHeaderLog: number;
};
