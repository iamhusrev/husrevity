import Foundation

/// Every user-facing string of the app, in Turkish. Views and view models never inline text.
public enum L10n {
    public enum Nav {
        public static let today = "Bugün"
        public static let inbox = "Gelen Kutusu"
        public static let calendar = "Takvim"
        public static let projects = "Projeler"
        public static let notes = "Notlar"
        public static let goals = "Hedefler"
        public static let settings = "Ayarlar"
        public static let webOnly = "Web'de"
    }

    public enum Common {
        public static let save = "Kaydet"
        public static let cancel = "Vazgeç"
        public static let delete = "Sil"
        public static let add = "Ekle"
        public static let edit = "Düzenle"
        public static let close = "Kapat"
        public static let retry = "Yeniden dene"
        public static let untitled = "Başlıksız"
        public static let search = "Ara"
        public static let openInWeb = "Web'de aç"
        public static let loadFailed = "Veriler okunamadı."
        public static func saveFailed(_ reason: String) -> String { "Kaydedilemedi: \(reason)" }
    }

    public enum Today {
        public static let title = "Bugün"
        public static let overdue = "Geciken"
        public static let today = "Bugün"
        public static let done = "Tamamlanan"
        public static let skipped = "Atlandı"
        public static let emptyTitle = "Bugün için bir şey yok"
        public static let emptyHint = "Hızlı ekle ile bir iş yazabilirsin."
        public static let reopenUnsupported = "Tekrarlayan bir işin tamamlanması geri alınamıyor."
        public static let recurring = "Tekrarlıyor"
    }

    public enum Inbox {
        public static let title = "Gelen Kutusu"
        public static let emptyTitle = "Gelen kutusu boş"
        public static let emptyHint = "Zamansız notlar ve işler burada birikir."
        public static let quickAddPlaceholder = "Hızlı ekle: yarın 9da HGS kontrol"
        public static let understood = "Anlaşıldı"
        public static let parseFailed = "Metin çözümlenemedi, olduğu gibi başlık olarak kaydedilecek."
        public static let added = "Eklendi"
        public static let noTime = "Zaman yok"
        public static let schedule = "Zamanla…"
    }

    public enum QuickAdd {
        public static let title = "Başlık"
        public static let time = "Zaman"
        public static let recurrence = "Tekrar"
        public static let context = "Bağlam"
        public static let project = "Proje"
        public static let priority = "Öncelik"
        public static let everyDay = "Her gün"
        public static let everyWeek = "Her hafta"
        public static let everyMonth = "Her ay"
        public static let everyYear = "Her yıl"
        public static let everyWeekday = "Hafta içi her gün"
        public static func everyN(_ n: Int, _ unit: String) -> String { "Her \(n) \(unit)" }
        public static func weekly(on days: String) -> String { "Her hafta \(days)" }
        public static let unit_day = "gün"
        public static let unit_week = "hafta"
        public static let unit_month = "ay"
        public static let unit_year = "yıl"
        public static let customRule = "Özel tekrar"
    }

    public enum Calendar {
        public static let title = "Takvim"
        public static let week = "Hafta"
        public static let month = "Ay"
        public static let goToday = "Bugün"
        public static let previous = "Önceki"
        public static let next = "Sonraki"
        public static let emptyDay = "Plan yok"
    }

    public enum Notes {
        public static let title = "Notlar"
        public static let searchPlaceholder = "Notlarda ara"
        public static let emptyTitle = "Not yok"
        public static let emptyHint = "Yeni bir not oluştur."
        public static let emptySearch = "Aramaya uyan not yok"
        public static let archived = "Arşiv"
        public static let pinned = "Sabitlenenler"
        public static let allTags = "Tüm etiketler"
        public static let newNote = "Yeni not"
        public static let pin = "Sabitle"
        public static let unpin = "Sabitlemeyi kaldır"
        public static let archive = "Arşivle"
        public static let unarchive = "Arşivden çıkar"
        public static let tags = "Etiketler"
        public static let newTag = "Yeni etiket"
        public static let bodyPlaceholder = "Not yaz…"
    }

    public enum Projects {
        public static let title = "Projeler"
        public static let emptyTitle = "Proje yok"
        public static let emptyHint = "İlk projeni oluştur."
        public static let archived = "Arşiv"
        public static let newProject = "Yeni proje"
        public static let code = "Kod"
        public static let name = "Ad"
        public static let description = "Açıklama"
        public static let codeInvalid = "Kod yalnızca harf, rakam, tire ve alt çizgi içerebilir."
        public static let nameRequired = "Proje adı gerekli."
        public static let codeRequired = "Proje kodu gerekli."
        public static let codeImmutable = "Sunucuya gönderilmiş bir projenin kodu değiştirilemez."
        public static let codeTaken = "Bu kodla başka bir proje var."
        public static let readOnly = "Bu projede değişiklik yapma yetkin yok."
        public static let newTask = "Yeni iş"
        public static func summary(open: Int, done: Int) -> String { "\(open) açık · \(done) tamamlandı" }
        public static func openCount(_ n: Int) -> String { "\(n) açık" }
        public static func doneCount(_ n: Int) -> String { "\(n) tamamlandı" }
        public static let shared = "Paylaşılan"
        public static let pin = "Sabitle"
        public static let unpin = "Sabitlemeyi kaldır"
        public static let archive = "Arşivle"
        public static let unarchive = "Arşivden çıkar"
    }

    public enum Goals {
        public static let title = "Hedefler"
        public static let emptyTitle = "Hedef yok"
        public static let emptyHint = "Yıllık bir hedefle başla."
        public static let year = "Yıl"
        public static let quarter = "Çeyrek"
        public static let month = "Ay"
        public static let newGoal = "Yeni hedef"
        public static let titleRequired = "Hedef başlığı gerekli."
        public static let parentMustBeLarger = "Üst hedefin ufku daha geniş olmalı (yıl > çeyrek > ay)."
        public static let periodOutsideParent = "Hedefin dönemi üst hedefin dönemi içinde kalmalı."
        public static let dropped = "Vazgeçildi"
        public static let sectionNoParent = "Üst hedefsiz"
        public static let active = "Aktif"
        public static let done = "Tamamlandı"
        public static let archived = "Arşiv"
        public static func progress(done: Int, total: Int) -> String { "\(done)/\(total)" }
        public static func percent(_ value: Int) -> String { "%\(value)" }
        public static func horizonLabel(_ horizon: String) -> String {
            switch horizon {
            case "year": return year
            case "quarter": return quarter
            case "month": return month
            default: return horizon
            }
        }
    }

    public enum Conflicts {
        public static let title = "Çakışmalar"
        public static let banner = "Çakışma var"
        public static func bannerCount(_ n: Int) -> String { "\(n) değişiklik sunucudakiyle çakıştı" }
        public static let reapply = "Yeniden uygula"
        public static let discard = "At"
        public static let failedTitle = "Gönderilemeyenler"
        public static let emptyTitle = "Çakışma yok"
        public static let yourChange = "Senin değişikliğin"
        public static let serverVersion = "Sunucudaki sürüm"
        public static let retry = "Yeniden dene"
        public static let discardEntry = "Vazgeç"
        public static let discardEntryConfirm =
            "Vazgeçersen bu kayıttaki yerel değişiklikler silinir ve kayıt sunucudaki haline döner. Bu geri alınamaz."
        public static let unknownError = "Bilinmeyen hata"
        public static func resolveFailed(_ reason: String) -> String { "İşlem tamamlanamadı: \(reason)" }
        public static func entityLabel(_ entity: String) -> String {
            switch entity {
            case "item": return "İş"
            case "item_occurrence": return "Tekrar kaydı"
            case "note": return "Not"
            case "note_tag": return "Etiket"
            case "project": return "Proje"
            case "goal": return "Hedef"
            default: return entity
            }
        }
        public static func opLabel(_ op: String) -> String {
            switch op {
            case "create": return "oluşturma"
            case "update": return "güncelleme"
            case "delete": return "silme"
            case "complete": return "tamamlama"
            default: return op
            }
        }
    }

    public enum Fields {
        public static let yes = "Evet"
        public static let no = "Hayır"
        public static let empty = "—"
        /// Display order for the fields of a conflict; unknown fields follow alphabetically.
        public static let order = [
            "title", "name", "scheduledAt", "dueAt", "status", "bodyMarkdown", "notes", "description",
        ]
        public static func label(_ key: String) -> String {
            switch key {
            case "title": return "Başlık"
            case "name": return "Ad"
            case "code": return "Kod"
            case "notes": return "Notlar"
            case "description": return "Açıklama"
            case "bodyMarkdown": return "İçerik"
            case "scheduledAt": return "Zaman"
            case "dueAt": return "Bitiş"
            case "durationMin": return "Süre (dk)"
            case "notifyMinutesBefore": return "Bildirim (dk önce)"
            case "status": return "Durum"
            case "context": return "Bağlam"
            case "rrule": return "Tekrar"
            case "pinned": return "Sabit"
            case "archived": return "Arşiv"
            case "tagIds": return "Etiketler"
            case "projectId": return "Proje"
            case "goalId": return "Hedef"
            case "parentGoalId": return "Üst hedef"
            case "horizon": return "Ufuk"
            case "periodStart": return "Başlangıç"
            case "periodEnd": return "Bitiş"
            case "colorHex", "color": return "Renk"
            case "occursOn": return "Gün"
            default: return key
            }
        }
    }

    public enum Sync {
        public static let synced = "Senkronize"
        public static let syncing = "Senkronize ediliyor…"
        public static let offline = "Çevrimdışı"
        public static let sessionExpired = "Oturum süresi doldu"
        public static let failed = "Senkronizasyon hatası"
        public static let syncNow = "Şimdi senkronize et"
        public static let signInAgain = "Yeniden giriş yap"
        public static let never = "Henüz senkronize edilmedi"
        public static let justNow = "az önce"
        public static func minutesAgo(_ n: Int) -> String { "\(n) dk önce" }
        public static func hoursAgo(_ n: Int) -> String { "\(n) sa önce" }
        public static func lastSynced(_ relative: String) -> String { "Son: \(relative)" }
        public static func pending(_ n: Int) -> String { "\(n) değişiklik bekliyor" }
    }

    public enum Login {
        public static let title = "Husrevity"
        public static let subtitle = "Hesabınla giriş yap"
        public static let email = "E-posta"
        public static let password = "Şifre"
        public static let server = "Sunucu"
        public static let production = "Canlı"
        public static let local = "Yerel (localhost:4090)"
        public static let custom = "Özel adres"
        public static let customPlaceholder = "https://sunucu.example.com"
        public static let signIn = "Giriş yap"
        public static let signingIn = "Giriş yapılıyor…"
        public static let emailRequired = "E-posta gerekli."
        public static let emailInvalid = "Geçerli bir e-posta gir."
        public static let passwordRequired = "Şifre gerekli."
        public static let urlInvalid = "Geçerli bir http(s) adresi gir."
        public static let wrongCredentials = "E-posta veya şifre hatalı."
        public static let offline = "Sunucuya ulaşılamadı. İnternet bağlantını ve sunucu adresini kontrol et."
        public static let rateLimited = "Çok fazla deneme yapıldı. Biraz bekleyip tekrar dene."
        public static let unknown = "Giriş yapılamadı. Lütfen tekrar dene."
        public static func server(_ code: Int) -> String { "Sunucu hatası (\(code)). Biraz sonra tekrar dene." }
        public static func rejected(_ message: String) -> String { "Giriş reddedildi: \(message)" }
        public static let storage = "Oturum bilgileri güvenli depoya yazılamadı."
    }

    public enum Settings {
        public static let title = "Ayarlar"
        public static let account = "Hesap"
        public static let server = "Sunucu"
        public static let webAddress = "Web adresi"
        public static let webAddressHint = "“Web'de aç” bağlantıları için. Boş bırakılırsa bağlantılar gizlenir."
        public static let webAddressInvalid = "Geçerli bir http(s) adresi gir."
        public static let signOut = "Çıkış yap"
        public static let signOutConfirm = "Çıkış yapılsın mı? Gönderilmemiş değişiklikler cihazda kalır."
        public static let signedInAs = "Giriş yapan"
        public static let webOnlyTitle = "Yalnızca web'de"
        public static let sync = "Senkronizasyon"
        public static let syncToggle = "Sunucuyla senkronize et"
        public static let syncHint =
            "Kapalıyken her şey yalnızca bu Mac'te kalır. Açınca yazdıkların sunucuya gönderilir."
        public static let localOnly = "Yalnızca bu Mac'te"
    }

    /// The first-launch question: stay on this Mac, or connect to a server.
    public enum Mode {
        public static let title = "Husrevity'ye hoş geldin"
        public static let subtitle = "Verilerini nasıl kullanmak istersin?"
        public static let localTitle = "Sadece bu Mac'te kullan"
        public static let localDetail =
            "Hesap gerekmez. Her şey bu bilgisayarda kalır, sunucuya bağlanılmaz. Sonra istersen senkronu açabilirsin; yazdıkların kaybolmaz."
        public static let syncTitle = "Sunucuya bağlan (senkron)"
        public static let syncDetail =
            "Giriş yaparsın; verilerin sunucuyla eşitlenir ve web'de ve diğer cihazlarda da görünür."
        public static let changeLater = "Bu seçimi Ayarlar'dan istediğin zaman değiştirebilirsin."
    }

    public enum WebModule {
        public static let vault = "Kasa"
        public static let learning = "Öğrenme"
        public static let sport = "Spor"
        public static let routine = "Rutin"
        public static let explanation = "Bu bölüm henüz uygulamada yok."
        public static let notConfigured = "Web adresi ayarlanmadı. Ayarlar'dan ekleyebilirsin."
    }
}
