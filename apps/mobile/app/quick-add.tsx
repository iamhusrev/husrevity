import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuickAddPreview, useCreateItem, ParsedDraft } from "../src/hooks/useQuickAdd";

export default function QuickAddScreen() {
  const router = useRouter();
  const previewMutation = useQuickAddPreview();
  const createMutation = useCreateItem();

  const [text, setText] = useState("");
  const [draft, setDraft] = useState<ParsedDraft | null>(null);
  const [editedTitle, setEditedTitle] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleParse = () => {
    if (!text.trim()) {
      setErrorMessage("Lütfen eklenecek bir metin girin.");
      return;
    }
    setErrorMessage(null);
    setSuccessMessage(null);

    previewMutation.mutate(text.trim(), {
      onSuccess: (data) => {
        setDraft(data);
        setEditedTitle(data.title);
      },
      onError: (err) => {
        setErrorMessage(err?.message || "Metin ayrıştırılamadı.");
      },
    });
  };

  const handleConfirm = () => {
    if (!draft) return;

    const titleToSave = editedTitle.trim() || draft.title;
    if (!titleToSave) {
      setErrorMessage("Başlık boş olamaz.");
      return;
    }

    setErrorMessage(null);
    createMutation.mutate(
      {
        kind: "task",
        title: titleToSave,
        scheduledAt: draft.scheduledAt || null,
        context: draft.context || null,
        rrule: draft.rrule || null,
      },
      {
        onSuccess: () => {
          setSuccessMessage("Öğe başarıyla eklendi!");
          setText("");
          setDraft(null);
          setEditedTitle("");
          setTimeout(() => {
            if (router.canGoBack()) {
              router.back();
            }
          }, 800);
        },
        onError: (err) => {
          setErrorMessage(err?.message || "Öğe oluşturulamadı.");
        },
      },
    );
  };

  const handleReset = () => {
    setText("");
    setDraft(null);
    setEditedTitle("");
    setErrorMessage(null);
    setSuccessMessage(null);
    previewMutation.reset();
    createMutation.reset();
  };

  const isParsing = previewMutation.isPending;
  const isCreating = createMutation.isPending;

  return (
    <SafeAreaView style={styles.container} edges={["bottom", "left", "right"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.kicker}>HIZLI EKLE</Text>
            <Text style={styles.title}>Yeni Görev veya Etkinlik</Text>
            <Text style={styles.subtitle}>
              Doğal dilde yazın (örn: "yarın 9da HGS kontrol #alican"), akıllı ayrıştırıcı detayları
              çıkarsın.
            </Text>
          </View>

          {/* Feedback Messages */}
          {errorMessage ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          {successMessage ? (
            <View style={styles.successCard}>
              <Text style={styles.successText}>{successMessage}</Text>
            </View>
          ) : null}

          {/* Input Form */}
          <View style={styles.inputSection}>
            <Text style={styles.label}>Hızlı Ekle Metni</Text>
            <TextInput
              style={styles.input}
              placeholder="örn: yarın 9da HGS kontrol #alican"
              placeholderTextColor="#78716c"
              value={text}
              onChangeText={(val) => {
                setText(val);
                if (draft) setDraft(null);
              }}
              onSubmitEditing={handleParse}
              returnKeyType="done"
              editable={!isParsing && !isCreating}
            />

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.parseButton, isParsing && styles.disabledButton]}
                onPress={handleParse}
                disabled={isParsing || isCreating}
              >
                {isParsing ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.parseButtonText}>Önizle / Ayrıştır</Text>
                )}
              </TouchableOpacity>

              {text || draft ? (
                <TouchableOpacity
                  style={styles.clearButton}
                  onPress={handleReset}
                  disabled={isParsing || isCreating}
                >
                  <Text style={styles.clearButtonText}>Temizle</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {/* Preview Section */}
          {draft ? (
            <View style={styles.previewCard}>
              <Text style={styles.previewTitle}>Önizleme ve Onay</Text>
              <Text style={styles.previewSubtitle}>
                Ayrıştırılan detaylar aşağıdadır. İnceleyip onaylayabilirsiniz.
              </Text>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Başlık</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={editedTitle}
                  onChangeText={setEditedTitle}
                  placeholder="Görev başlığı"
                  placeholderTextColor="#78716c"
                />
              </View>

              {draft.scheduledAt ? (
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Planlanan Zaman</Text>
                  <Text style={styles.fieldValue}>
                    {new Date(draft.scheduledAt).toLocaleString("tr-TR")}
                  </Text>
                </View>
              ) : null}

              {draft.context ? (
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Bağlam (#context)</Text>
                  <Text style={styles.fieldValue}>#{draft.context}</Text>
                </View>
              ) : null}

              {draft.rrule ? (
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Tekrarlama (RRULE)</Text>
                  <Text style={styles.fieldValue}>{draft.rrule}</Text>
                </View>
              ) : null}

              {draft.priority ? (
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Öncelik</Text>
                  <Text style={styles.fieldValue}>{draft.priority}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={[styles.confirmButton, isCreating && styles.disabledButton]}
                onPress={handleConfirm}
                disabled={isCreating}
              >
                {isCreating ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.confirmButtonText}>Onayla ve Ekle</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Close / Back button */}
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              }
            }}
          >
            <Text style={styles.cancelButtonText}>Kapat</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0c0a09",
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 20,
  },
  kicker: {
    fontSize: 12,
    fontWeight: "700",
    color: "#c8732e",
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#f5f5f4",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#a8a29e",
    lineHeight: 20,
  },
  errorCard: {
    backgroundColor: "#451a1a",
    borderColor: "#7f1d1d",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: "#fca5a5",
    fontSize: 14,
  },
  successCard: {
    backgroundColor: "#143823",
    borderColor: "#15803d",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  successText: {
    color: "#86efac",
    fontSize: 14,
    fontWeight: "600",
  },
  inputSection: {
    backgroundColor: "#1c1917",
    borderRadius: 16,
    padding: 16,
    borderColor: "#292524",
    borderWidth: 1,
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#d6d3d1",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#292524",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#f5f5f4",
    fontSize: 15,
    borderColor: "#44403c",
    borderWidth: 1,
    marginBottom: 12,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 10,
  },
  parseButton: {
    flex: 1,
    backgroundColor: "#a14d18",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  parseButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
  clearButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#292524",
    alignItems: "center",
    justifyContent: "center",
  },
  clearButtonText: {
    color: "#a8a29e",
    fontSize: 14,
    fontWeight: "500",
  },
  previewCard: {
    backgroundColor: "#1c1917",
    borderRadius: 16,
    padding: 16,
    borderColor: "#a14d18",
    borderWidth: 1.5,
    marginBottom: 20,
  },
  previewTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#f5f5f4",
    marginBottom: 4,
  },
  previewSubtitle: {
    fontSize: 13,
    color: "#a8a29e",
    marginBottom: 16,
  },
  fieldGroup: {
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 12,
    color: "#a8a29e",
    marginBottom: 4,
    fontWeight: "500",
  },
  fieldInput: {
    backgroundColor: "#292524",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#f5f5f4",
    fontSize: 15,
    borderColor: "#44403c",
    borderWidth: 1,
  },
  fieldValue: {
    fontSize: 15,
    color: "#e7e5e4",
    fontWeight: "500",
  },
  confirmButton: {
    backgroundColor: "#15803d",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  confirmButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
  disabledButton: {
    opacity: 0.6,
  },
  cancelButton: {
    alignItems: "center",
    paddingVertical: 12,
  },
  cancelButtonText: {
    color: "#78716c",
    fontSize: 14,
    fontWeight: "500",
  },
});
