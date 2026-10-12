import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v3';
import { looksLikeSecret } from './secret-guard';
import { SECRETS_REFUSED_MESSAGE } from './plan-input';

export function registerPlanningPrompts(server: McpServer) {
  server.registerPrompt(
    'plan_day',
    {
      description:
        'Günlük planlama: get_life_context ile bağlamı al, Evkat rutinine ve mevcut programına saygı duy, onay al ve apply_plan ile uygula',
      argsSchema: {
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be in YYYY-MM-DD format')
          .optional()
          .describe('Planlanacak gün (YYYY-MM-DD biçiminde, belirtilmezse bugün)'),
      },
    },
    async (args) => {
      if (args?.date && !/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
        throw new Error('date must be in YYYY-MM-DD format');
      }
      const targetDate = args?.date ? args.date : 'bugün';
      const promptText = [
        `Hedef gün: ${targetDate}.`,
        'Husrevity üzerinde günü planlamak için şu adımları izle:',
        '1. Önce `get_life_context` aracını çağırarak bugünün zaman çizelgesini, teslim tarihi olan işleri, gecikmiş görevleri ve son değişiklikleri incele.',
        '2. Mevcut zamanlanmış etkinliklere ve kullanıcının Evkat rutinine (sabah, öğle, ikindi, akşam, yatsı blokları) kesinlikle saygı duy; çakışma yaratacak yeni iş planlama.',
        '3. Önerdiğin planı sade ve anlaşılır bir Türkçe ile kullanıcıya özetle; belirsiz veya net olmayan noktalar için kullanıcıdan onay iste.',
        "4. Onay aldıktan sonra planı tek bir `apply_plan` çağrısıyla uygula. Eğer uygulanacak işlem sayısı 5'ten fazlaysa, önce `dryRun: true` parametresi ile ön doğrulama yap ve çakışma uyarılarını kontrol et.",
        '5. Plan uygulandığında dönen `changeSetId` değerini kullanıcıya bildir ve yapılan tüm işlemlerin istendiğinde `undo_change_set` aracıyla tek hamlede geri alınabileceğini belirt.',
        'Önemli kural: operations cannot reference items created in the same plan; give each create its own scheduledAt/dueAt and durationMin.',
        'Güvenlik kuralı: Asla parola veya gizli anahtar saklama (never store secrets).',
      ].join('\n');

      return {
        description: `Plan day for ${targetDate}`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: promptText,
            },
          },
        ],
      };
    },
  );

  server.registerPrompt(
    'plan_week',
    {
      description:
        'Haftalık planlama: get_life_context ile 7 günlük bağlamı al, haftalık yükü ve Evkat rutinini gözet, apply_plan ile uygula',
      argsSchema: {
        startDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be in YYYY-MM-DD format')
          .optional()
          .describe('Haftanın başlangıç tarihi (YYYY-MM-DD, belirtilmezse bugün)'),
      },
    },
    async (args) => {
      if (args?.startDate && !/^\d{4}-\d{2}-\d{2}$/.test(args.startDate)) {
        throw new Error('startDate must be in YYYY-MM-DD format');
      }
      const targetStart = args?.startDate ? args.startDate : 'bu hafta';
      const promptText = [
        `Hedef başlangıç: ${targetStart}.`,
        'Husrevity üzerinde haftalık planlama yapmak için şu adımları izle:',
        '1. `get_life_context` aracını (days: 7 veya gereken gün sayısı ile) çağırarak haftalık ajandayı, yaklaşan işleri, geciken görevleri ve aktif projeleri al.',
        '2. Hafta geneline yayılmış mevcut etkinlikleri ve günlük Evkat rutinlerini gözet; günleri aşırı doldurmaktan kaçın.',
        '3. Haftalık dengeli plan teklifini gün gün anlaşılır bir Türkçe ile sun; öncelikler veya olası belirsizlikler hakkında kullanıcının teyidini al.',
        "4. Kullanıcı onayladığında planı tek bir `apply_plan` çağrısıyla uygula. 5'ten fazla işlem bulunuyorsa önce `dryRun: true` ile dene.",
        '5. Plan kaydedildiğinde oluşan `changeSetId` bilgisini kullanıcıya ver ve kullanıcının bu planı dilediğinde `undo_change_set` ile kolayca geri alabileceğini hatırlat.',
        'Önemli kural: operations cannot reference items created in the same plan; give each create its own scheduledAt/dueAt and durationMin.',
        'Güvenlik kuralı: Asla parola veya gizli anahtar saklama (never store secrets).',
      ].join('\n');

      return {
        description: `Plan week starting from ${targetStart}`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: promptText,
            },
          },
        ],
      };
    },
  );

  server.registerPrompt(
    'review_month',
    {
      description:
        'Aylık değerlendirme: get_life_context ve list_goals ile ayın hedef ilerlemesini, tamamlanan ve geciken işleri özetle, gelecek ayın hedeflerini öner',
      argsSchema: {
        month: z
          .string()
          .regex(
            /^\d{4}-(0[1-9]|1[0-2])$/,
            'month must be in YYYY-MM format with valid month (01-12)',
          )
          .optional()
          .describe('Değerlendirilecek ay (YYYY-MM biçiminde, örn: 2026-10)'),
      },
    },
    async (args) => {
      if (args?.month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(args.month)) {
        throw new Error('month must be in YYYY-MM format with valid month (01-12)');
      }
      const targetMonth = args?.month ? args.month : 'bu ay';
      const promptText = [
        `Hedef ay: ${targetMonth}.`,
        'Husrevity üzerinde aylık değerlendirme yapmak için şu adımları izle:',
        '1. Önce `get_life_context` ve `list_goals` araçlarını çağırarak hedef aya ait verileri al.',
        '2. Ay içindeki hedef ilerlemesini (goal progress) özetle; tamamlanan işleri ve geciken/aksayan (slipped) işleri listele.',
        '3. Gelecek ay için önerilen hedefleri kullanıcıya sun ve yeni hedef veya kayıt oluşturmadan önce mutlaka kullanıcıdan onay iste.',
        '4. Kullanıcı onay verdikten sonra yeni hedefleri `create_goal` ile oluştur ve ilgili işleri `link_to_goal` ile bağla; oluşan `changeSetId` bilgisini kullanıcıya bildir.',
        'Güvenlik kuralı: Asla parola, kimlik bilgisi veya gizli anahtar saklama (never store secrets/credentials).',
      ].join('\n');

      return {
        description: `Review month for ${targetMonth}`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: promptText,
            },
          },
        ],
      };
    },
  );

  server.registerPrompt(
    'set_goal',
    {
      description:
        'Hedef belirleme: eksik ufuk/dönem bilgilerini sor, üst hedefleri list_goals ile kontrol et, create_goal ile oluştur ve link_to_goal teklif et',
      argsSchema: {
        title: z
          .string()
          .max(200)
          .regex(
            /^[^\r\n\x00-\x1f\x7f]*$/,
            'title must not contain line breaks or control characters',
          )
          .optional()
          .describe('Hedef başlığı'),
        horizon: z
          .enum(['year', 'quarter', 'month'])
          .optional()
          .describe('Hedef ufku (year, quarter, month)'),
      },
    },
    async (args) => {
      if (args?.title) {
        if (args.title.length > 200 || /[\r\n\x00-\x1f\x7f]/.test(args.title)) {
          throw new Error(
            'title must be at most 200 characters and contain no line breaks or control characters',
          );
        }
        if (looksLikeSecret(args.title)) {
          throw new Error(SECRETS_REFUSED_MESSAGE);
        }
      }
      const promptTitle = args?.title ? ` "${args.title}"` : '';
      const promptHorizon = args?.horizon ? ` (${args.horizon})` : '';
      const promptText = [
        `Hedef:${promptTitle}${promptHorizon}.`,
        'Husrevity üzerinde hedef belirlemek ve yapılandırmak için şu adımları izle:',
        '1. Eğer hedef ufku (horizon: year, quarter, month) veya dönem tarihleri (periodStart, periodEnd) eksikse, kullanıcıya sorarak bu bilgileri netleştir.',
        '2. `list_goals` aracını kullanarak mevcut hedefleri listele ve uygun bir üst hedef (parent goal) olup olmadığını kontrol et.',
        '3. Bilgiler tamamlandığında hedefi `create_goal` aracını kullanarak oluştur.',
        '4. Hedef oluşturulduktan sonra, ilgili görev veya projeleri hedefe bağlamak için `link_to_goal` aracını kullanmayı teklif et.',
        'Güvenlik kuralı: Asla parola, kimlik bilgisi veya gizli anahtar saklama (never store secrets/credentials).',
      ].join('\n');

      return {
        description: `Set goal${promptTitle}`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: promptText,
            },
          },
        ],
      };
    },
  );
}
