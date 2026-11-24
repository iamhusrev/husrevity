/**
 * Copy for the public pages (/, /privacy, /terms). These pages are server
 * components rendered outside the client i18n stack, so they use this typed
 * dictionary instead of messages/{en,tr}.json. public-pages.test.tsx asserts
 * that both languages keep the same structure.
 */
export type PublicLanguage = "en" | "tr";

export interface Section {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface PublicContent {
  nav: { home: string; privacy: string; terms: string; language: string };
  home: {
    tagline: string;
    description: string;
    signIn: string;
    register: string;
    featuresHeading: string;
    features: { title: string; body: string }[];
    googleHeading: string;
    googleBody: string;
  };
  legal: {
    operatorLabel: string;
    contactLabel: string;
    notConfigured: string;
  };
  privacy: { title: string; intro: string; sections: Section[] };
  terms: { title: string; intro: string; sections: Section[] };
  googlePolicy: { name: string; linkLabel: string };
}

export const GOOGLE_POLICY_URL = "https://developers.google.com/terms/api-services-user-data-policy";

const en: PublicContent = {
  nav: { home: "Home", privacy: "Privacy Policy", terms: "Terms of Service", language: "Türkçe" },
  home: {
    tagline: "A calm personal productivity app.",
    description:
      "Husrevity brings your notes, tasks, projects, reminders and calendar into one place.",
    signIn: "Sign in",
    register: "Create account",
    featuresHeading: "What it does",
    features: [
      { title: "Notes and lists", body: "Capture ideas and keep them organised." },
      { title: "Tasks and projects", body: "Plan work alone or with collaborators." },
      { title: "Calendar and reminders", body: "See your day, week and month at a glance." },
    ],
    googleHeading: "Google integration",
    googleBody:
      "You can sign in with Google and connect Google Calendar to view its events inside Husrevity. Both are optional. Connections made with the new engine are read-only unless you opt in to writing Husrevity events to a separate Husrevity Planner calendar; older legacy connections may also write Husrevity events to your Google calendar. See the Privacy Policy for exactly what is collected and why.",
  },
  legal: {
    operatorLabel: "Operated by",
    contactLabel: "Contact",
    notConfigured: "Operator and contact details are not configured for this deployment.",
  },
  googlePolicy: {
    name: "Google API Services User Data Policy",
    linkLabel: "Read the policy",
  },
  privacy: {
    title: "Privacy Policy",
    intro:
      "This policy explains what Husrevity collects when you use it, including data received from Google, why it is collected, how long it is kept and how you can have it deleted.",
    sections: [
      {
        heading: "Data we collect",
        paragraphs: [
          "Account data: the email address, display name and content you create in the app (notes, tasks, projects, reminders and calendar entries).",
        ],
      },
      {
        heading: "Google data and why we use it",
        paragraphs: [
          "Husrevity only requests the Google access it needs for the features you turn on.",
        ],
        bullets: [
          "Sign in with Google: your Google account identifier, email address and name, used only to identify you and sign you in. No Google access token is kept for sign-in.",
          "Google Calendar (new read-only connection, read-only unless you opt in to writing Husrevity events to the managed Husrevity Planner calendar): the list of your calendars and the events in the calendars you choose, used only to display those events inside Husrevity. We store only titles, times and the calendar and event identifiers, and we do not store descriptions, attendees or locations.",
          "Google Calendar (legacy connection, used until the new read-only connection is switched on for your account): the older sync may write Husrevity events to your Google calendar, creating and updating them there. It may also store the descriptions of the events it imports. Those stored copies can be reachable through your own MCP or personal access token access to your Husrevity account.",
          "Optional Husrevity Planner calendar: writing your planned Husrevity events to a separate calendar named Husrevity Planner is off by default. It happens only after you opt in, and it sends titles and times only.",
        ],
      },
      {
        heading: "AI and Google data",
        paragraphs: [
          "Google Calendar data is not sent to Gemini and is not used to train AI models. The AI suggestion feature excludes Google-sourced calendar blocks.",
          "Legacy synced copies are reachable by an AI or MCP client only if you connect that client with your own access token.",
        ],
      },
      {
        heading: "Limited Use",
        paragraphs: [
          "Husrevity's use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements.",
          "We do not sell Google user data, do not use it for advertising, and do not allow people to read it except as needed to provide the features you use, for security, or to comply with the law.",
        ],
      },
      {
        heading: "Retention",
        paragraphs: [
          "Account data is retained while your account exists. Events synced by the new read-only connection are retained only while the connection exists and are removed when you disconnect. Copies made by the legacy sync stay in your Husrevity account until you delete them (when disconnecting, or at any time later from Settings > Integrations) or delete your account. If revoking the Google token fails, the encrypted token is kept only for a limited number of retries and is then deleted.",
        ],
      },
      {
        heading: "Deletion and disconnecting",
        paragraphs: [
          "When you disconnect Google Calendar in Settings, we stop the Google notification channels, revoke the Google token with Google and remove the stored tokens, and we permanently delete the calendar data synced by the new read-only connection.",
          "Disconnecting does not delete the synced copies stored in your Husrevity account unless you explicitly confirm that when you disconnect. If you do not confirm, those copies stay, and you can delete them at any time later from Settings > Integrations.",
          "If you used the legacy connection, a technical record remains after you disconnect: the Google calendar identifier of the Husrevity calendar, the sync cursor and the event link identifiers, but no access or refresh token, so that a reconnect can resume with the same calendar. Confirming the deletion of the synced copies also deletes those copies and their event links and clears the sync cursor, but keeps the calendar identifier. You can have the remaining record removed with an account deletion request to the contact email shown below.",
          "Events Husrevity wrote to Google stay in your Google account after you disconnect. To remove them, delete the Husrevity Planner calendar or the events in Google Calendar, or remove Husrevity's access in your Google Account permissions. Turning write off deletes those managed copies from the Husrevity Planner calendar shortly afterwards.",
          "Revocation can fail, for example when Google cannot be reached. We then retry a limited number of times and, after the last attempt, delete the stored token anyway, but the Google grant may stay active. You can always remove Husrevity yourself at https://myaccount.google.com/permissions.",
          "To delete your account and all associated data, send an account deletion request to the contact email shown below.",
        ],
      },
      {
        heading: "Sharing",
        paragraphs: [
          "We do not sell your data. Data is shared only with the infrastructure providers needed to run the service, and with collaborators you explicitly invite to a shared project.",
        ],
      },
    ],
  },
  terms: {
    title: "Terms of Service",
    intro: "By creating an account or using Husrevity you agree to these terms.",
    sections: [
      {
        heading: "The service",
        paragraphs: [
          "Husrevity is a personal productivity application provided as is, without warranties of any kind. Features may change or be withdrawn.",
        ],
      },
      {
        heading: "Your account",
        paragraphs: [
          "You are responsible for keeping your credentials secure and for the content you store. Do not use the service for anything unlawful or abusive.",
        ],
      },
      {
        heading: "Google services",
        paragraphs: [
          "Google features are optional and governed by the Privacy Policy. Connections made with the new engine are read-only unless you opt in to writing Husrevity events to the Husrevity Planner calendar; legacy connections may also write Husrevity events to your Google calendar, as the Privacy Policy describes. You can disconnect at any time.",
        ],
      },
      {
        heading: "Termination",
        paragraphs: [
          "You may stop using the service and request deletion of your account at any time. We may suspend accounts that abuse the service.",
        ],
      },
      {
        heading: "Changes",
        paragraphs: ["We may update these terms. Continued use after an update means you accept it."],
      },
    ],
  },
};

const tr: PublicContent = {
  nav: { home: "Ana sayfa", privacy: "Gizlilik Politikası", terms: "Kullanım Koşulları", language: "English" },
  home: {
    tagline: "Sakin bir kişisel üretkenlik uygulaması.",
    description:
      "Husrevity notlarını, görevlerini, projelerini, anımsatıcılarını ve takvimini tek yerde toplar.",
    signIn: "Giriş yap",
    register: "Hesap oluştur",
    featuresHeading: "Ne yapar",
    features: [
      { title: "Notlar ve listeler", body: "Fikirlerini yakala ve düzenli tut." },
      { title: "Görevler ve projeler", body: "İşleri tek başına ya da ekiple planla." },
      { title: "Takvim ve anımsatıcılar", body: "Günü, haftayı ve ayı tek bakışta gör." },
    ],
    googleHeading: "Google entegrasyonu",
    googleBody:
      "Google ile giriş yapabilir ve Google Takvim'ini bağlayıp etkinliklerini Husrevity içinde görebilirsin. İkisi de isteğe bağlıdır. Yeni altyapıyla yapılan bağlantılar, Husrevity etkinliklerini ayrı bir Husrevity Planner takvimine yazmayı açmadıkça salt okunurdur; eski bağlantılar Husrevity etkinliklerini Google takviminize de yazabilir. Nelerin neden toplandığı için Gizlilik Politikası'na bak.",
  },
  legal: {
    operatorLabel: "İşleten",
    contactLabel: "İletişim",
    notConfigured: "Bu kurulum için işletici ve iletişim bilgileri yapılandırılmamış.",
  },
  googlePolicy: {
    name: "Google API Services User Data Policy",
    linkLabel: "Politikayı oku",
  },
  privacy: {
    title: "Gizlilik Politikası",
    intro:
      "Bu politika, Husrevity'yi kullanırken neyin toplandığını, Google'dan alınan verileri, neden toplandığını, ne kadar süre saklandığını ve nasıl sildirebileceğini açıklar.",
    sections: [
      {
        heading: "Topladığımız veriler",
        paragraphs: [
          "Hesap verileri: e-posta adresin, görünen adın ve uygulamada oluşturduğun içerik (notlar, görevler, projeler, anımsatıcılar ve takvim kayıtları).",
        ],
      },
      {
        heading: "Google verileri ve kullanım amacı",
        paragraphs: [
          "Husrevity yalnızca açtığın özellikler için gereken Google erişimini ister.",
        ],
        bullets: [
          "Google ile giriş: Google hesap tanımlayıcın, e-posta adresin ve adın; yalnızca seni tanımak ve giriş yaptırmak için kullanılır. Giriş için Google erişim belirteci saklanmaz.",
          "Google Takvim (yeni salt okunur bağlantı; Husrevity etkinliklerini yönetilen Husrevity Planner takvimine yazmayı açmadıkça salt okunurdur): takvimlerinin listesi ve seçtiğin takvimlerdeki etkinlikler, yalnızca bu etkinlikleri Husrevity içinde göstermek için kullanılır. Başlık, saat ile takvim ve etkinlik kimlikleri dışında bir şey saklamayız; açıklama, katılımcı ve konum saklamayız.",
          "Google Takvim (eski bağlantı, hesabında yeni salt okunur bağlantı açılana kadar kullanılır): eski senkronizasyon Husrevity etkinliklerini Google takviminize yazabilir; orada oluşturabilir ve güncelleyebilir. İçe aktardığı etkinliklerin açıklamalarını da saklayabilir. Bu saklanan kopyalara, Husrevity hesabına erişen kendi MCP veya kişisel erişim belirteci erişimin üzerinden ulaşılabilir.",
          "İsteğe bağlı Husrevity Planner takvimi: planladığın Husrevity etkinliklerini Husrevity Planner adlı ayrı bir takvime yazmak varsayılan olarak kapalıdır. Yalnızca sen açtıktan sonra çalışır ve yalnızca başlık ile saat gönderir.",
        ],
      },
      {
        heading: "Yapay zeka ve Google verileri",
        paragraphs: [
          "Google Takvim verileri Gemini'ye gönderilmez ve yapay zeka modellerini eğitmek için kullanılmaz. Yapay zeka öneri özelliği Google kaynaklı takvim bloklarını hariç tutar.",
          "Eski senkronize kopyalara bir yapay zeka veya MCP istemcisi yalnızca o istemciyi kendi erişim belirteciyle bağlarsan ulaşabilir.",
        ],
      },
      {
        heading: "Limited Use (Sınırlı Kullanım)",
        paragraphs: [
          "Husrevity'nin Google API'lerinden alınan bilgileri kullanması ve başka bir uygulamaya aktarması, Limited Use gereklilikleri dahil Google API Services User Data Policy'ye uygun olacaktır.",
          "Google kullanıcı verilerini satmayız, reklam için kullanmayız ve kullandığın özellikleri sunmak, güvenlik veya yasal yükümlülükler dışında kimsenin okumasına izin vermeyiz.",
        ],
      },
      {
        heading: "Saklama süresi",
        paragraphs: [
          "Hesap verileri hesabın var olduğu sürece saklanır. Yeni salt okunur bağlantıyla senkronize edilen etkinlikler yalnızca bağlantı var olduğu sürece saklanır ve bağlantıyı kestiğinde kaldırılır. Eski senkronizasyonun oluşturduğu kopyalar, sen silene (bağlantıyı keserken ya da daha sonra istediğin zaman Ayarlar > Entegrasyonlar'dan) veya hesabını silene kadar Husrevity hesabında kalır. Google belirtecinin iptali başarısız olursa şifreli belirteç yalnızca sınırlı sayıda yeniden deneme için saklanır ve sonra silinir.",
        ],
      },
      {
        heading: "Silme ve bağlantıyı kesme",
        paragraphs: [
          "Ayarlar'dan Google Takvim bağlantısını kestiğinde Google bildirim kanallarını durdururuz, Google belirtecini Google nezdinde iptal ederiz ve saklanan belirteçleri kaldırırız; yeni salt okunur bağlantıyla senkronize edilen takvim verilerini de kalıcı olarak sileriz.",
          "Bağlantıyı keserken bunu açıkça onaylamadıkça Husrevity hesabında saklanan senkronize kopyaları silmeyiz. Onaylamazsan bu kopyalar kalır ve daha sonra istediğin zaman Ayarlar > Entegrasyonlar'dan silebilirsin.",
          "Eski bağlantıyı kullandıysan, bağlantıyı kestikten sonra teknik bir kayıt kalır: Husrevity takviminin Google takvim kimliği, senkron imleci ve etkinlik bağlantı kimlikleri; erişim veya yenileme belirteci içermez. Böylece yeniden bağlandığında aynı takvimle devam edilebilir. Senkronize kopyaların silinmesini onaylamak bu kopyaları ve etkinlik bağlantılarını da siler ve senkron imlecini temizler, ancak takvim kimliği kalır. Kalan kaydın kaldırılmasını, aşağıda gösterilen iletişim e-postasına hesap silme talebi göndererek isteyebilirsin.",
          "Husrevity'nin Google'a yazdığı etkinlikler bağlantıyı kestikten sonra da Google hesabında kalır. Kaldırmak için Husrevity Planner takvimini veya etkinlikleri Google Takvim'den sil ya da Google Hesap izinlerinden Husrevity'nin erişimini kaldır. Yazmayı kapatmak, yönetilen bu kopyaları Husrevity Planner takviminden kısa süre sonra siler.",
          "İptal işlemi başarısız olabilir, örneğin Google'a ulaşılamadığında. Bu durumda sınırlı sayıda yeniden deneriz ve son denemeden sonra saklanan belirteci yine de sileriz, ancak Google erişimi aktif kalabilir. Husrevity'yi her zaman kendin https://myaccount.google.com/permissions adresinden kaldırabilirsin.",
          "Hesabını ve ilişkili tüm verileri sildirmek için aşağıda gösterilen iletişim e-postasına hesap silme talebi gönder.",
        ],
      },
      {
        heading: "Paylaşım",
        paragraphs: [
          "Verilerini satmayız. Veriler yalnızca hizmetin çalışması için gereken altyapı sağlayıcılarıyla ve paylaşılan bir projeye açıkça davet ettiğin kişilerle paylaşılır.",
        ],
      },
    ],
  },
  terms: {
    title: "Kullanım Koşulları",
    intro: "Hesap oluşturarak veya Husrevity'yi kullanarak bu koşulları kabul edersin.",
    sections: [
      {
        heading: "Hizmet",
        paragraphs: [
          "Husrevity kişisel bir üretkenlik uygulamasıdır ve olduğu gibi, herhangi bir garanti verilmeden sunulur. Özellikler değişebilir veya kaldırılabilir.",
        ],
      },
      {
        heading: "Hesabın",
        paragraphs: [
          "Kimlik bilgilerini güvende tutmaktan ve sakladığın içerikten sen sorumlusun. Hizmeti yasa dışı veya kötüye kullanım amacıyla kullanma.",
        ],
      },
      {
        heading: "Google hizmetleri",
        paragraphs: [
          "Google özellikleri isteğe bağlıdır ve Gizlilik Politikası'na tabidir. Yeni altyapıyla yapılan bağlantılar, Husrevity etkinliklerini Husrevity Planner takvimine yazmayı açmadıkça salt okunurdur; eski bağlantılar Gizlilik Politikası'nda anlatıldığı gibi Husrevity etkinliklerini Google takviminize de yazabilir. İstediğin zaman bağlantıyı kesebilirsin.",
        ],
      },
      {
        heading: "Sonlandırma",
        paragraphs: [
          "Hizmeti istediğin zaman bırakabilir ve hesabının silinmesini isteyebilirsin. Hizmeti kötüye kullanan hesapları askıya alabiliriz.",
        ],
      },
      {
        heading: "Değişiklikler",
        paragraphs: [
          "Bu koşulları güncelleyebiliriz. Güncellemeden sonra kullanmaya devam etmen onu kabul ettiğin anlamına gelir.",
        ],
      },
    ],
  },
};

export const content: Record<PublicLanguage, PublicContent> = { en, tr };
