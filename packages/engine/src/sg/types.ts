// Game 4 "Tín hiệu sớm" (Chuyên đề 1: Thị trường trong thời đại số) – phần công khai.
// Trình duyệt chỉ nhập file này. Mô hình ẩn (chuyển dịch nào thật, chất lượng tín hiệu) nằm ở sg/game.ts.

/** Sáu nhóm thông tin thị trường cần theo dõi (giáo trình, mục 4.3). */
export type SgGroup = 'size' | 'customer' | 'rival' | 'price' | 'tech' | 'inside';
export const SG_GROUPS: SgGroup[] = ['size', 'customer', 'rival', 'price', 'tech', 'inside'];

export interface SgGroupInfo {
  icon: string;
  name: string;
  /** Câu hỏi quản trị mà nhóm thông tin này trả lời. */
  question: string;
  /** Giờ phân tích phải trả mỗi quý để giữ cảm biến ở nhóm này. */
  cost: number;
}

export const SG_GROUP_INFO: Record<SgGroup, SgGroupInfo> = {
  size: { icon: '📈', name: 'Quy mô và tăng trưởng', question: 'Thị trường đang mở rộng hay thu hẹp?', cost: 1 },
  customer: { icon: '👥', name: 'Khách hàng và nhu cầu', question: 'Ai mua, vì sao mua, nhu cầu đang thay đổi thế nào?', cost: 2 },
  rival: { icon: '⚔️', name: 'Đối thủ và giải pháp thay thế', question: 'Đối thủ đang tạo giá trị khác biệt ở đâu?', cost: 2 },
  price: { icon: '🏷️', name: 'Giá và kênh phân phối', question: 'Giá, điều kiện thương mại và kênh bán thay đổi ra sao?', cost: 1 },
  tech: { icon: '🔬', name: 'Công nghệ và môi trường kinh doanh', question: 'Công nghệ, chính sách nào ảnh hưởng tới thị trường?', cost: 2 },
  inside: { icon: '🏢', name: 'Hiệu quả kinh doanh nội bộ', question: 'Phân khúc nào có doanh thu, lợi nhuận và tiềm năng tốt?', cost: 1 },
};

/** Sáu chuyển dịch lớn của thị trường (giáo trình, mục 1.2). Mỗi trận chỉ một số chuyển dịch là thật. */
export type SgShift = 'digital' | 'selfserve' | 'substitute' | 'datadriven' | 'aitarget' | 'solution';
export const SG_SHIFTS: SgShift[] = ['digital', 'selfserve', 'substitute', 'datadriven', 'aitarget', 'solution'];

export const SG_SHIFT_INFO: Record<SgShift, { icon: string; name: string; note: string }> = {
  digital: { icon: '🌐', name: 'Thị trường vật lý → thị trường kết nối số', note: 'Khách tìm, so sánh và đánh giá nhà cung cấp trên kênh số trước khi gặp người bán.' },
  selfserve: { icon: '🔎', name: 'Người mua thụ động → người mua chủ động', note: 'Khách tự nghiên cứu tiêu chuẩn, giá và năng lực nhà cung cấp trước khi liên hệ.' },
  substitute: { icon: '🔁', name: 'Cạnh tranh trong ngành → cạnh tranh giữa các giải pháp', note: 'Đối thủ có thể đến từ ngoài ngành, đáp ứng cùng nhu cầu bằng cách khác.' },
  datadriven: { icon: '📊', name: 'Quyết định theo kinh nghiệm → quyết định theo dữ liệu', note: 'Doanh nghiệp phát hiện tín hiệu sớm từ dữ liệu giao dịch, phản hồi, giá.' },
  aitarget: { icon: '🎯', name: 'Marketing đại trà → marketing có mục tiêu nhờ AI', note: 'Phân khúc hẹp và nội dung riêng cho từng nhóm khách có hiệu quả hơn.' },
  solution: { icon: '🧩', name: 'Bán sản phẩm → cung cấp giải pháp và trải nghiệm', note: 'Khách quan tâm tổng giá trị: độ tin cậy, chi phí vận hành, dịch vụ kỹ thuật.' },
};

/** Bốn chiều kiểm chứng của giáo trình (mục 4.4, bước 3) hiện ra thành năm loại chất lượng tín hiệu. */
export type SgQuality = 'solid' | 'stale' | 'thin' | 'restricted' | 'false';

export const SG_QUALITY_INFO: Record<SgQuality, { icon: string; name: string; dim: string; note: string }> = {
  solid: { icon: '✅', name: 'Dùng được', dim: 'đạt cả bốn chiều', note: 'Đáng tin, còn thời sự, đủ đại diện và được phép dùng.' },
  stale: { icon: '🕰️', name: 'Lỗi thời', dim: 'thời điểm', note: 'Đúng vào lúc thu thập, nhưng số liệu đã cũ so với quyết định hôm nay.' },
  thin: { icon: '🪶', name: 'Thiếu đại diện', dim: 'tính đại diện', note: 'Chỉ từ vài trường hợp, không đại diện cho cả phân khúc.' },
  restricted: { icon: '🔒', name: 'Không được phép dùng', dim: 'quyền sử dụng', note: 'Dữ liệu của đơn vị khác hoặc dữ liệu cá nhân: dùng để ra quyết định công khai là vi phạm.' },
  false: { icon: '❌', name: 'Không đúng', dim: 'độ tin cậy', note: 'Nguồn không kiểm chứng được, hoặc con số đã bị bịa thêm.' },
};

/** Bốn câu hỏi kinh doanh mở đầu quy trình Market Intelligence (bước 1). */
export type SgQuestion = 'growth' | 'churn' | 'rivalry' | 'value';
export const SG_QUESTIONS: SgQuestion[] = ['growth', 'churn', 'rivalry', 'value'];
export const SG_QUESTION_INFO: Record<SgQuestion, { name: string; focus: SgGroup[] }> = {
  growth: { name: 'Phân khúc nào có tiềm năng tăng trưởng trong 12 tháng tới?', focus: ['size', 'customer'] },
  churn: { name: 'Vì sao một số khách hàng giảm lượng đặt hàng?', focus: ['customer', 'inside'] },
  rivalry: { name: 'Khách đang được ai giải quyết nhu cầu thay cho chúng ta?', focus: ['rival', 'tech'] },
  value: { name: 'Khách sẵn sàng trả thêm cho giá trị nào?', focus: ['price', 'customer'] },
};

/** Một quyết định: chuyển hiểu biết thành hành động đo lường được (bước 5). */
export type SgAction = 'none' | 'probe' | 'reprice' | 'solution' | 'segment';
export const SG_ACTIONS: SgAction[] = ['none', 'probe', 'reprice', 'solution', 'segment'];

export interface SgActionInfo {
  icon: string;
  name: string;
  what: string;
  /** Giờ phân tích. */
  cost: number;
  /** Tiền về (tỷ đồng) nếu đánh đúng chuyển dịch thật, đúng thời điểm, không ai tranh. */
  gain: number;
  /** Mất đi (tỷ đồng) nếu chuyển dịch đó không có thật. */
  loss: number;
}

export const SG_ACTION_INFO: Record<SgAction, SgActionInfo> = {
  none: { icon: '⏸️', name: 'Chưa hành động', what: 'Giữ nguyên, dành giờ cho theo dõi và kiểm chứng.', cost: 0, gain: 0, loss: 0 },
  probe: { icon: '🧪', name: 'Thử nghiệm một địa bàn', what: 'Chương trình nhỏ ở một khu vực; rẻ, và quý sau biết chắc chuyển dịch có thật hay không.', cost: 2, gain: 1.4, loss: 0.7 },
  reprice: { icon: '🏷️', name: 'Điều chỉnh giá và điều kiện', what: 'Đổi chính sách giá, công nợ, điều kiện cung ứng cho nhóm khách đang dịch chuyển.', cost: 2, gain: 2.2, loss: 1.4 },
  solution: { icon: '🧩', name: 'Dựng gói giải pháp', what: 'Gộp sản phẩm với dịch vụ kỹ thuật và cam kết vận hành thành một giải pháp.', cost: 3, gain: 3.6, loss: 2.5 },
  segment: { icon: '🚪', name: 'Vào phân khúc mới', what: 'Mở một phân khúc khách hàng chưa phục vụ.', cost: 3, gain: 3.4, loss: 2.9 },
};

/** Hành động nào phù hợp với chuyển dịch nào (công khai: in ra để học viên tính trước). */
export const SG_FIT: Record<SgShift, SgAction[]> = {
  digital: ['segment', 'probe'],
  selfserve: ['solution', 'probe'],
  substitute: ['solution', 'segment'],
  datadriven: ['probe', 'reprice'],
  aitarget: ['segment', 'reprice'],
  solution: ['solution', 'probe'],
};
/** Hệ số theo mức phù hợp: đúng nhất, phù hợp, không liên quan. */
export const SG_FIT_MUL = [1, 0.6, 0.25];

/**
 * Hệ số theo thời điểm. Đúng một quý trước khi chuyển dịch ăn tiền là tốt nhất; đi quá sớm thì
 * thị trường chưa có ở đó, đi muộn thì cơ hội còn nhưng đã chia cho nhiều người.
 */
export const SG_WHEN_MUL = { premature: 0.5, early: 1.5, onTime: 1, late: 0.6, tooLate: 0.3 };
/** Quyết định không có bằng chứng đã kiểm chứng chỉ được duyệt một phần. */
export const SG_NO_EVIDENCE_MUL = 0.45;
/** Mỗi đơn vị khác cùng đánh vào một chuyển dịch trong quý làm phần chia nhỏ lại bấy nhiêu. */
export const SG_CROWD = 0.15;

/** Cách đặt vấn đề (giáo trình mục 5: lấy sản phẩm hay lấy khách hàng làm trung tâm). */
export type SgFrame = 'product' | 'job';
export const SG_FRAME_INFO: Record<SgFrame, { name: string; what: string; cost: number; flat: number; mul: number }> = {
  product: { name: 'Theo sản phẩm', what: '“Làm sao bán thêm sản phẩm của mình?” Có ngay một ít doanh thu mỗi quý, nhưng mọi cơ hội đều nhỏ lại.', cost: 0, flat: 0.45, mul: 0.85 },
  job: { name: 'Theo công việc của khách', what: '“Khách cần hoàn thành việc gì?” Mất một giờ để làm lại bài phân tích, nhưng cơ hội lớn hơn.', cost: 1, flat: 0, mul: 1.15 },
};
/** Đặt vấn đề theo công việc của khách còn mở thêm hai chuyển dịch về giải pháp. */
export const SG_JOB_BONUS: SgShift[] = ['substitute', 'solution'];
export const SG_JOB_BONUS_MUL = 1.3;

export const SG_ROUNDS = 5;
/** Giờ phân tích mỗi quý. */
export const SG_HOURS = 10;
/** Giờ để kiểm chứng một tín hiệu. */
export const SG_VERIFY_COST = 1;
export const SG_MAX_EVIDENCE = 3;
/** Để AI tổng hợp: thêm tín hiệu, không mất giờ. */
export const SG_AI_EXTRA = 2;
/** Tiền phạt (tỷ đồng) khi ra quyết định dựa trên dữ liệu không được phép dùng. */
export const SG_RESTRICTED_FINE = 1.8;
/** Mất mát khi bỏ qua chuyển dịch giải pháp thay thế: một phân khúc đóng lại. */
export const SG_BLIND_LOSS = 2.6;
export const SG_BLIND_ROUND = 4;
/** Lợi nhuận cộng dồn (tỷ đồng) để đạt trọn điểm phần lợi nhuận. */
export const SG_PROFIT_TARGET = 6;

export interface SgSignal {
  id: string;
  round: number;
  group: SgGroup;
  /** Nguồn tin, như học viên nhìn thấy. */
  source: string;
  text: string;
  /** Do AI tổng hợp: một phần số liệu có thể bịa. */
  ai?: boolean;
  /** Chỉ có sau khi đã trả giờ kiểm chứng (hoặc khi trận kết thúc). */
  quality?: SgQuality;
  /** Chuyển dịch mà tín hiệu này nói tới – xác nhận cùng lúc với kiểm chứng. */
  shift?: SgShift | null;
}

export interface SgDecision {
  question: SgQuestion;
  sensors: SgGroup[];
  verify: string[];
  aiDigest: boolean;
  frame: SgFrame;
  action: SgAction;
  target: SgShift | null;
  evidence: string[];
  /** Giả thuyết làm việc cho quý sau: thêm một tín hiệu thuộc chuyển dịch đó. */
  watch: SgShift | null;
}

export interface SgLine {
  label: string;
  value: number;
  note?: string;
}

export interface SgReport {
  round: number;
  /** Tín hiệu đã kiểm chứng trong quý, kèm kết quả. */
  checked: SgSignal[];
  action: SgAction;
  target: SgShift | null;
  /** Chuyển dịch được nhắm có thật hay không – chỉ cho biết khi đã hành động. */
  real: boolean | null;
  lines: SgLine[];
  profit: number;
  profitCum: number;
  discipline: number;
  notes: string[];
}

export interface SgView {
  hours: number;
  /** Tín hiệu quý này mà các cảm biến của bạn nhìn thấy. */
  signals: SgSignal[];
  /** Những tín hiệu đã kiểm chứng từ đầu trận. */
  known: SgSignal[];
  sensors: SgGroup[];
  ai: boolean;
  watch: SgShift | null;
  profitCum: number;
  /** Chuyển dịch đã được thử nghiệm xác nhận (nhờ hành động thử nghiệm). */
  confirmed: Partial<Record<SgShift, boolean>>;
  /** Cuối trận: toàn bộ mô hình ẩn. */
  truth: { shift: SgShift; real: boolean; from: number | null }[] | null;
}

export interface SgPub {
  /** Mỗi chuyển dịch đã có bao nhiêu đơn vị đặt cược (không nói ai). */
  bets: Partial<Record<SgShift, number>>;
  /** Số đơn vị có cảm biến ở từng nhóm thông tin. */
  watchers: Partial<Record<SgGroup, number>>;
}

export const SG_SCORE_PARTS: Record<string, string> = {
  profit: 'Lợi nhuận cộng dồn',
  early: 'Chỉ số tín hiệu sớm',
  discipline: 'Kỷ luật thông tin',
};
export const SG_SCORE_MAX: Record<string, number> = { profit: 45, early: 30, discipline: 25 };

export const SG_BADGES: Record<string, string> = {
  early: 'Người đọc tín hiệu sớm',
  clean: 'Không quyết định trên tin chưa kiểm chứng',
  job: 'Lấy khách hàng làm trung tâm',
  wide: 'Nhìn ra ngoài ngành',
  lean: 'Ít dữ liệu, nhiều quyết định',
  leader: 'Dẫn đầu phòng',
};

export const SG_ARCHETYPE_INFO: Record<string, string> = {
  hoarder: 'thu thập tất cả',
  believer: 'tin ngay',
  pricewatch: 'chỉ xem giá đối thủ',
  aionly: 'để AI làm',
  latecomer: 'chờ chắc chắn',
  reader: 'đọc tín hiệu có chọn lọc',
};

export const SG_QUARTER_INFO: { title: string; text: string }[] = [
  { title: 'Quý 1 – đặt cảm biến', text: 'Thị trường đang thay đổi, nhưng chưa ai biết thay đổi nào là thật. Chọn câu hỏi kinh doanh, bật cảm biến ở những nhóm thông tin đáng theo dõi, và nhớ: nhóm vừa bật thì quý sau mới có dữ liệu.' },
  { title: 'Quý 2 – tín hiệu đầu tiên', text: 'Tín hiệu bắt đầu về. Có tín hiệu đúng, có tín hiệu lỗi thời, có tín hiệu chỉ từ vài trường hợp, và có tín hiệu không đúng. Kiểm chứng tốn một giờ cho mỗi tín hiệu; hành động dựa trên tín hiệu chưa kiểm chứng là đánh cược.' },
  { title: 'Quý 3 – ai dám đi trước', text: 'Hành động sớm hơn một quý được ăn gấp rưỡi. Nhưng nếu chuyển dịch đó không có thật thì khoản đầu tư mất trắng.' },
  { title: 'Quý 4 – thị trường đã lộ', text: 'Giờ thì nhiều đơn vị cũng thấy. Cùng đánh vào một chuyển dịch thì phần chia nhỏ lại. Ai chưa bao giờ theo dõi đối thủ và công nghệ sẽ nhận hậu quả trong quý này.' },
  { title: 'Quý 5 – chốt sổ', text: 'Quý cuối. Lợi nhuận cộng dồn, chỉ số tín hiệu sớm và kỷ luật thông tin cùng được chốt. Cuối trận mọi chuyển dịch đều được lật: cái nào thật, cái nào chỉ là nhiễu.' },
];

export const SG_DEBRIEF: string[] = [
  'Dữ liệu không tự tạo ra lợi thế. Bật đủ sáu nhóm thông tin rồi kiểm chứng mọi thứ thì hết giờ, không còn gì để hành động – điểm thông tin cao mà lợi nhuận bằng không.',
  'Market Intelligence khác Market Research ở chỗ nó phải trả lời được: thông tin này có ý nghĩa gì và ta cần làm gì.',
  'Một tín hiệu có thể đúng mà vẫn không dùng được: lỗi thời, chỉ từ vài trường hợp, hoặc không có quyền sử dụng. Bốn chiều kiểm chứng là bốn cách một tín hiệu làm bạn sai.',
  'Đối thủ có thể đến từ ngoài ngành. Ai chỉ theo dõi giá của đối thủ hiện tại sẽ không thấy giải pháp thay thế đang lấy khách của mình.',
  'AI tổng hợp nhanh và rẻ, nhưng kết quả AI phải được kiểm chứng trước khi dùng để ra quyết định về giá, khách hàng hay đầu tư.',
  'Hành động sớm ăn đậm vì chưa ai tranh; hành động muộn thì cơ hội còn đó nhưng phần chia đã nhỏ.',
  'Hỏi “khách cần hoàn thành việc gì” mở ra những cơ hội mà câu hỏi “làm sao bán thêm sản phẩm” không nhìn thấy.',
  'Giữ một giả thuyết đã bị dữ liệu phủ nhận là lỗi đắt nhất trong phân tích thị trường.',
];

export const SG_SOURCE = 'Chuyên đề 1 · Thị trường trong thời đại số – Chương trình DIGIMARK, Petrovietnam';
