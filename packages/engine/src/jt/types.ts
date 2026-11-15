// Game 5 "Hành trình và niềm tin" (Chuyên đề 3: Tiếp thị số và trải nghiệm khách hàng) – phần công khai.
// Trình duyệt chỉ nhập file này. Trọng số thật của từng giai đoạn và lượt rút sự cố nằm ở jt/game.ts.

/** Sáu giai đoạn của hành trình khách hàng (giáo trình, mục 4.2). */
export type JtStage = 'aware' | 'consider' | 'evaluate' | 'buy' | 'use' | 'loyal';
export const JT_STAGES: JtStage[] = ['aware', 'consider', 'evaluate', 'buy', 'use', 'loyal'];

export interface JtStageInfo {
  icon: string;
  name: string;
  /** Câu hỏi của khách ở giai đoạn này. */
  ask: string;
  /** Vai trò của marketing số. */
  role: string;
  /** Điểm chạm tương ứng ở ba cấp. */
  levels: [string, string, string];
}

export const JT_STAGE_INFO: Record<JtStage, JtStageInfo> = {
  aware: {
    icon: '👀',
    name: 'Nhận biết',
    ask: 'Tôi đang có vấn đề hoặc nhu cầu gì?',
    role: 'Tạo nhận biết, cung cấp thông tin',
    levels: ['Trang giới thiệu doanh nghiệp', 'Bài viết chuyên môn về rủi ro vận hành, có SEO', 'Chuỗi nội dung và hội thảo trực tuyến định kỳ'],
  },
  consider: {
    icon: '📚',
    name: 'Tìm hiểu',
    ask: 'Có những giải pháp nào?',
    role: 'Giải thích, tư vấn, giáo dục thị trường',
    levels: ['Danh mục sản phẩm', 'Tài liệu giải pháp theo từng ứng dụng', 'Công cụ chọn phương án và thư viện tiêu chuẩn'],
  },
  evaluate: {
    icon: '🔍',
    name: 'Đánh giá',
    ask: 'Nhà cung cấp nào phù hợp?',
    role: 'Cung cấp bằng chứng, so sánh, giải đáp',
    levels: ['Giới thiệu năng lực chung', 'Hồ sơ dự án tham khảo và chứng nhận', 'Hồ sơ kỹ thuật đầy đủ, số liệu kiểm chứng, đầu mối trả lời trong ngày'],
  },
  buy: {
    icon: '🤝',
    name: 'Mua hàng',
    ask: 'Mua hoặc ký hợp đồng thế nào?',
    role: 'Hỗ trợ chuyển đổi và quy trình giao dịch',
    levels: ['Biểu mẫu liên hệ', 'Quy trình báo giá rõ ràng, có cam kết thời gian', 'Cổng khách hàng: hồ sơ, báo giá, hợp đồng điện tử'],
  },
  use: {
    icon: '🔧',
    name: 'Sử dụng',
    ask: 'Giải pháp có đáp ứng kỳ vọng?',
    role: 'Hỗ trợ sử dụng, chăm sóc, tiếp nhận phản hồi',
    levels: ['Số điện thoại hỗ trợ', 'Hướng dẫn vận hành và báo cáo tiến độ', 'Theo dõi vận hành từ xa, cam kết thời gian xử lý sự cố'],
  },
  loyal: {
    icon: '💛',
    name: 'Gắn bó',
    ask: 'Có nên tiếp tục hợp tác và giới thiệu?',
    role: 'Duy trì quan hệ, nâng cao trải nghiệm',
    levels: ['Gọi lại khi hết hợp đồng', 'Họp định kỳ và khảo sát hài lòng', 'Báo cáo hiệu quả hợp tác và đề xuất cải tiến hằng kỳ'],
  },
};

export const JT_MAX_LEVEL = 3;
/** Điểm nguồn lực để nâng điểm chạm lên cấp 1, 2, 3. */
export const JT_STAGE_COST = [1, 2, 3];

/** Owned – Paid – Earned (giáo trình, mục 3.2). */
export const JT_MEDIA_INFO = {
  owned: { icon: '🏠', name: 'Owned – kênh mình sở hữu', what: 'Website, tài liệu số, email, cổng khách hàng. Lên chậm, nhưng cộng dồn thành tài sản và không mất đi khi ngừng chi.' },
  paid: { icon: '💳', name: 'Paid – kênh trả phí', what: 'Quảng cáo tìm kiếm, mạng xã hội, tài trợ nội dung. Có tiếp cận ngay trong quý, và về gần 0 khi ngừng chi.' },
  earned: { icon: '🗣️', name: 'Earned – sự chú ý tự nhiên', what: 'Báo chí, đánh giá, giới thiệu. KHÔNG mua được: nó sinh ra từ trải nghiệm khách hàng và độ tin cậy, rồi nhân hệ số tiếp cận của bạn.' },
} as const;

export const JT_MAX_PAID = 6;
export const JT_MAX_OWNED = 6;
/** Tiếp cận trong quý từ mỗi điểm Paid. */
export const JT_PAID_REACH = 1;
/** Tiếp cận từ mỗi điểm tài sản Owned đã tích lũy. */
export const JT_OWNED_REACH = 0.35;
/** Tài sản Owned còn lại sau mỗi quý. */
export const JT_OWNED_KEEP = 0.85;
/** Earned nhân thêm bao nhiêu khi trải nghiệm và độ tin cậy ở mức cao nhất. */
export const JT_EARNED = 0.6;
/** Số khách hàng tiềm năng tương ứng một đơn vị tiếp cận. */
export const JT_POOL = 2;
/** Giá trị một hợp đồng mới và một hợp đồng tái ký (tỷ đồng). */
export const JT_CONTRACT = 0.45;
export const JT_RENEW = 0.35;

/** Quản trị nội dung: ai được đăng, ai phê duyệt (giáo trình, mục 6.4 – nguyên tắc Governance). */
export type JtGov = 'fast' | 'single' | 'full';
export const JT_GOVS: JtGov[] = ['fast', 'single', 'full'];
export const JT_GOV_INFO: Record<JtGov, { name: string; what: string; cost: number; risk: number; severity: number; reach: number }> = {
  fast: { name: 'Đăng nhanh, không phê duyệt', what: 'Mỗi kênh tự đăng. Ra nội dung nhiều hơn, và không ai chịu trách nhiệm cuối.', cost: 0, risk: 1, severity: 1, reach: 1.1 },
  single: { name: 'Đầu mối truyền thông phê duyệt', what: 'Một đầu mối rà soát trước khi đăng.', cost: 1, risk: 0.6, severity: 0.8, reach: 1 },
  full: { name: 'Phê duyệt theo phân quyền, có giám sát kênh', what: 'Phân định rõ quyền đăng, phê duyệt, giám sát và xử lý sự cố.', cost: 2, risk: 0.35, severity: 0.6, reach: 0.95 },
};

/** Nội dung do AI tạo: con người chịu trách nhiệm kiểm chứng và phê duyệt (giáo trình, mục 7.6). */
export type JtAi = 'direct' | 'review' | 'approve';
export const JT_AIS: JtAi[] = ['direct', 'review', 'approve'];
export const JT_AI_INFO: Record<JtAi, { name: string; what: string; cost: number; content: number; risk: number }> = {
  direct: { name: 'AI viết, đăng trực tiếp', what: 'Nhanh và gần như miễn phí. Không ai kiểm chứng số liệu và tuyên bố.', cost: 0, content: 0.9, risk: 0.18 },
  review: { name: 'AI viết, người rà soát', what: 'Một người đọc lại trước khi đăng.', cost: 1, content: 1, risk: 0.05 },
  approve: { name: 'AI viết, phê duyệt theo phân quyền', what: 'Kiểm chứng và phê duyệt theo thẩm quyền trước khi công bố.', cost: 2, content: 1.05, risk: 0 },
};

/** Năm điểm đau thường gặp (giáo trình, mục 5.3) – sửa được là sửa luôn, có hiệu lực mãi. */
export type JtFix = 'sla' | 'content' | 'crm' | 'aftercare';
export const JT_FIXES: JtFix[] = ['sla', 'content', 'crm', 'aftercare'];
export const JT_FIX_INFO: Record<JtFix, { icon: string; name: string; pain: string; helps: JtStage[] }> = {
  sla: { icon: '⏱️', name: 'Cam kết thời gian phản hồi', pain: 'Phản hồi yêu cầu chậm làm giảm cơ hội bán hàng.', helps: ['evaluate', 'buy'] },
  content: { icon: '📄', name: 'Chuẩn hóa nội dung kỹ thuật', pain: 'Website thiếu thông tin kỹ thuật nên khách khó đánh giá giải pháp.', helps: ['consider', 'evaluate'] },
  crm: { icon: '🗂️', name: 'CRM lưu lịch sử tương tác', pain: 'Khách phải cung cấp lại thông tin từ đầu mỗi lần liên hệ.', helps: ['buy', 'use'] },
  aftercare: { icon: '🤲', name: 'Chăm sóc sau bán có hệ thống', pain: 'Thiếu chăm sóc sau bán làm mất cơ hội duy trì quan hệ.', helps: ['use', 'loyal'] },
};
export const JT_FIX_COST = 1;
/** Mỗi điểm đau đã sửa nâng chỉ số trải nghiệm thêm bấy nhiêu. */
export const JT_FIX_CX = 0.12;
/** Và giảm tỷ lệ rơi ở những giai đoạn nó giúp. */
export const JT_FIX_HELP = 0.22;
/**
 * Giai đoạn chưa có điểm chạm nào là một lỗ, không chỉ là một chỗ yếu: khách rơi hẳn tại đó.
 * Tỷ lệ đi tiếp của một giai đoạn cấp 0 còn bị nhân thêm hệ số này.
 */
export const JT_HOLE = 0.5;

/** Bảy nhóm rủi ro truyền thông số (giáo trình, mục 7.2). */
export type JtRisk = 'wrong' | 'crisis' | 'leak' | 'fake' | 'aicontent' | 'reply' | 'channels';
export const JT_RISKS: JtRisk[] = ['wrong', 'crisis', 'leak', 'fake', 'aicontent', 'reply', 'channels'];

export interface JtRiskInfo {
  icon: string;
  name: string;
  /** Tình huống như học viên đọc thấy. */
  text: string;
  /** Thiệt hại cơ bản (tỷ đồng) nếu xử lý sai hoàn toàn. */
  damage: number;
  /** Sự cố liên quan an toàn, môi trường hoặc bảo mật: che giấu hoặc trì hoãn là vi phạm. */
  hard?: boolean;
}

export const JT_RISK_INFO: Record<JtRisk, JtRiskInfo> = {
  wrong: { icon: '📉', name: 'Thông tin sai lệch', text: 'Một thông số sản phẩm chưa được xác minh đã lên website và được khách dẫn lại trong hồ sơ mời thầu.', damage: 1.6 },
  crisis: { icon: '🔥', name: 'Khủng hoảng truyền thông', text: 'Thông tin về một sự cố vận hành tại nhà máy đang lan nhanh trên mạng xã hội, kèm ảnh chưa rõ nguồn.', damage: 3.2, hard: true },
  leak: { icon: '🔓', name: 'Rò rỉ dữ liệu', text: 'Một bản hợp đồng có thông tin khách hàng bị đăng kèm trong bài giới thiệu năng lực.', damage: 2.8, hard: true },
  fake: { icon: '🎭', name: 'Giả mạo thương hiệu', text: 'Xuất hiện một trang mạng xã hội mang tên đơn vị, nhận cọc của khách.', damage: 2.2 },
  aicontent: { icon: '🤖', name: 'Rủi ro nội dung AI', text: 'Một bài do AI soạn đưa ra cam kết hiệu suất mà đơn vị chưa từng kiểm chứng.', damage: 2 },
  reply: { icon: '💬', name: 'Phản hồi thiếu phù hợp', text: 'Một nhân viên tranh luận công khai với khách dưới bài đăng của đơn vị.', damage: 1.4 },
  channels: { icon: '📡', name: 'Thiếu kiểm soát kênh', text: 'Ba tài khoản của các đơn vị trực thuộc đăng ba con số khác nhau về cùng một dự án.', damage: 1.8 },
};

/** Quy trình xử lý rủi ro truyền thông số, 6 bước (giáo trình, mục 7.4) – và hai nước đi luôn làm xấu hơn. */
export type JtStep = 'detect' | 'verify' | 'classify' | 'escalate' | 'respond' | 'follow' | 'rebut' | 'delete';
export const JT_STEPS: JtStep[] = ['detect', 'verify', 'classify', 'escalate', 'respond', 'follow', 'rebut', 'delete'];
export const JT_STEP_INFO: Record<JtStep, { name: string; what: string; bad?: boolean }> = {
  detect: { name: 'Phát hiện', what: 'Lưu lại thông tin và bằng chứng ban đầu, giám sát phạm vi lan truyền.' },
  verify: { name: 'Xác minh', what: 'Kiểm tra nguồn, bằng chứng và tính chính xác với bộ phận chuyên môn.' },
  classify: { name: 'Phân loại', what: 'Đánh giá mức độ nghiêm trọng, tính khẩn cấp và các bên bị ảnh hưởng.' },
  escalate: { name: 'Chuyển cấp và phê duyệt', what: 'Báo đầu mối truyền thông, lãnh đạo và các bộ phận pháp chế, kỹ thuật, an toàn, bảo mật.' },
  respond: { name: 'Phản hồi', what: 'Cung cấp thông tin đã được xác minh, nhất quán, đúng thẩm quyền.' },
  follow: { name: 'Theo dõi và cải tiến', what: 'Giám sát phản ứng, cập nhật thông tin và rút kinh nghiệm sau sự cố.' },
  rebut: { name: 'Phản bác ngay', what: 'Trả lời ngay để bảo vệ hình ảnh, chưa cần xác minh.', bad: true },
  delete: { name: 'Xóa mọi bình luận', what: 'Ẩn bài, xóa bình luận tiêu cực cho yên chuyện.', bad: true },
};
/** Chỉ được chọn ba bước: 60 phút đầu tiên không đủ cho cả sáu. */
export const JT_MAX_STEPS = 3;
/** Mỗi bước đúng giảm thiệt hại bấy nhiêu phần. */
export const JT_STEP_CUT = 0.25;
/** Phản hồi trước khi xác minh thì thiệt hại tăng. */
export const JT_RESPOND_FIRST = 1.6;
/** Mỗi nước đi làm xấu hơn. */
export const JT_BAD_MOVE = 1.5;
/** Che giấu hoặc trì hoãn với sự cố an toàn, môi trường, bảo mật. */
export const JT_CONCEAL = 2;
/** Mỗi nước đi làm xấu hơn còn để lại vết trên điểm thương hiệu của các quý sau. */
export const JT_BAD_SCAR = 0.22;
/** Và trần điểm thương hiệu của người che giấu. */
export const JT_CONCEAL_CAP = 0.4;

/** Chỉ số trải nghiệm khách hàng (giáo trình, mục 5.4). */
export const JT_CX_INFO: { key: string; name: string; what: string }[] = [
  { key: 'csat', name: 'CSAT', what: 'Mức độ hài lòng' },
  { key: 'nps', name: 'NPS', what: 'Khả năng giới thiệu' },
  { key: 'ces', name: 'CES', what: 'Mức độ dễ dàng khi tương tác' },
  { key: 'response', name: 'Thời gian phản hồi', what: 'Từ khi nhận yêu cầu đến khi phản hồi' },
  { key: 'retention', name: 'Tỷ lệ duy trì', what: 'Khách tiếp tục hợp tác trong kỳ' },
];

export const JT_ROUNDS = 5;
/** Điểm nguồn lực mỗi quý. */
export const JT_POINTS = 12;
/** Xác suất nền để một sự cố nổ trong quý. */
export const JT_RISK_BASE = 0.55;
/** Chi nhiều cho Paid thì nội dung đi xa hơn, và sự cố cũng to hơn. */
export const JT_PAID_RISK = 0.05;
/** Doanh thu cộng dồn (tỷ đồng) để đạt trọn điểm phần kết quả kinh doanh. */
export const JT_REV_TARGET = 20;

export interface JtDecision {
  build: Record<JtStage, number>;
  paid: number;
  owned: number;
  gov: JtGov;
  ai: JtAi;
  fixes: JtFix[];
  /** Ba bước xử lý sự cố đang mở (nếu có). */
  response: JtStep[];
}

export interface JtIncident {
  risk: JtRisk;
  round: number;
  /** Đã xử lý ở quý sau hay chưa. */
  handled?: boolean;
  steps?: JtStep[];
  damage?: number;
  verdict?: string;
}

export interface JtStageLine {
  stage: JtStage;
  level: number;
  /** Khách vào giai đoạn này. */
  inFlow: number;
  /** Tỷ lệ đi tiếp. */
  pass: number;
  lost: number;
}

export interface JtReport {
  round: number;
  reach: number;
  ownedStock: number;
  earnedMul: number;
  stages: JtStageLine[];
  contracts: number;
  kept: number;
  revenue: number;
  revenueCum: number;
  cx: number;
  cxRows: { key: string; value: number }[];
  trust: number;
  /** Sự cố vừa xử lý trong quý này. */
  resolved: JtIncident | null;
  /** Sự cố mới nổ, phải xử lý ở quý sau. */
  opened: JtIncident | null;
  notes: string[];
}

export interface JtView {
  points: number;
  build: Record<JtStage, number>;
  ownedStock: number;
  fixes: JtFix[];
  gov: JtGov;
  ai: JtAi;
  revenueCum: number;
  cx: number;
  trust: number;
  /** Sự cố đang chờ xử lý trong quý này. */
  open: JtIncident | null;
  riskScore: { likelihood: number; impact: number } | null;
  concealed: boolean;
  /** Cuối trận: trọng số thật của sáu giai đoạn và toàn bộ sự cố. */
  truth: { weights: { stage: JtStage; weight: number }[]; incidents: JtIncident[] } | null;
}

export interface JtPub {
  /** Trải nghiệm trung bình của cả phòng. */
  cx: number;
  /** Số sự cố đang mở trong phòng. */
  open: number;
  /** Tổng số sự cố đã nổ. */
  incidents: number;
}

export const JT_SCORE_PARTS: Record<string, string> = {
  business: 'Kết quả kinh doanh',
  cx: 'Trải nghiệm khách hàng',
  brand: 'Thương hiệu và quản trị rủi ro',
};
export const JT_SCORE_MAX: Record<string, number> = { business: 40, cx: 30, brand: 30 };

export const JT_BADGES: Record<string, string> = {
  whole: 'Phủ đủ sáu giai đoạn',
  asset: 'Xây tài sản số, không đi thuê tiếp cận',
  earned: 'Được nhắc tới mà không phải trả phí',
  calm: 'Xử lý sự cố đúng thứ tự',
  honest: 'Không che giấu sự cố nào',
  leader: 'Dẫn đầu phòng',
};

export const JT_ARCHETYPE_INFO: Record<string, string> = {
  buyreach: 'mua tiếp cận',
  websiteonly: 'chỉ làm website',
  loose: 'nhanh và lỏng',
  frontonly: 'chỉ chăm đầu phễu',
  hider: 'giấu sự cố',
  balanced: 'phủ đủ hành trình, có quản trị',
};

export const JT_QUARTER_INFO: { title: string; text: string }[] = [
  { title: 'Quý 1 – dựng hành trình', text: 'Bạn phụ trách marketing số cho gói khí/LNG bán cho khách hàng công nghiệp. Mỗi quý có 12 điểm nguồn lực. Hành trình có sáu giai đoạn: giai đoạn nào bỏ trống thì khách rơi ngay tại đó, và bạn chưa biết giai đoạn nào nặng nhất với nhóm khách này.' },
  { title: 'Quý 2 – phễu đã lộ chỗ rò', text: 'Báo cáo quý trước cho bạn tỷ lệ đi tiếp của từng giai đoạn. Đọc nó để biết khách rơi ở đâu. Paid cho tiếp cận ngay nhưng về 0 khi ngừng chi; Owned lên chậm và cộng dồn; Earned không mua được.' },
  { title: 'Quý 3 – niềm tin bắt đầu có giá', text: 'Trải nghiệm tốt sinh ra Earned Media, và Earned nhân hệ số cho toàn bộ tiếp cận. Sự cố truyền thông cũng bắt đầu nổ: cơ chế phê duyệt và mức kiểm soát nội dung AI quyết định xác suất và mức độ.' },
  { title: 'Quý 4 – 60 phút đầu tiên', text: 'Sự cố nổ ở quý trước phải được xử lý ngay đầu quý này, và bạn chỉ kịp ba bước trong sáu bước của quy trình. Phản hồi trước khi xác minh làm thiệt hại tăng. Với sự cố an toàn, môi trường hay bảo mật, che giấu là vi phạm, không có cách nào kiếm lại bằng điểm kinh doanh.' },
  { title: 'Quý 5 – chốt sổ', text: 'Quý cuối. Kết quả kinh doanh, trải nghiệm khách hàng, thương hiệu và quản trị rủi ro cùng được chốt. Cuối trận trọng số thật của sáu giai đoạn được lật ra.' },
];

export const JT_DEBRIEF: string[] = [
  'Marketing số không phải là quảng cáo số. Nó là hệ thống nối chiến lược, khách hàng, nội dung, công nghệ và dữ liệu.',
  'Hành trình vỡ ở giai đoạn yếu nhất. Nội dung nhận biết rất tốt mà bước đánh giá không có bằng chứng thì khách rơi đúng ở bước đánh giá.',
  'Với khách hàng công nghiệp, bước Đánh giá nặng nhất: họ cần hồ sơ, tiêu chuẩn và số liệu kiểm chứng, không cần thêm quảng cáo.',
  'Paid mở rộng tiếp cận nhưng ngừng chi là mất; Owned lên chậm nhưng thành tài sản; Earned không mua được, nó đến từ trải nghiệm thật.',
  'Customer Journey không kết thúc ở giao dịch. Trải nghiệm sau mua quyết định khả năng duy trì và giới thiệu.',
  'Truyền thông tạo kỳ vọng, năng lực thực hiện tạo niềm tin. Hứa quá năng lực là tự tạo sự cố cho mình.',
  'Rủi ro truyền thông phải được quản trị trước khi thành khủng hoảng: phân quyền, phê duyệt và năng lực phản ứng.',
  'Xác minh trước khi phản hồi. Phản bác ngay và xóa bình luận luôn làm mọi thứ xấu hơn.',
  'Với sự cố an toàn, môi trường hoặc bảo mật, không được ưu tiên bảo vệ hình ảnh bằng cách che giấu sự thật hay trì hoãn nghĩa vụ thông báo.',
  'AI giúp marketing nhanh hơn nhưng không thay con người chịu trách nhiệm kiểm chứng, bảo mật và phê duyệt.',
];

export const JT_SOURCE = 'Chuyên đề 3 · Tiếp thị số và trải nghiệm khách hàng – Chương trình DIGIMARK, Petrovietnam';
