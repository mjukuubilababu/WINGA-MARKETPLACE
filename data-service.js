(function () {
  const USERS_KEY = "winga-users";
  const PRODUCTS_KEY = "winga-products";
  const SESSION_KEY = "winga-current-user";
  const MOCK_SEEDED_KEY = "winga-mock-seeded";
  const MOCK_SEED_VERSION_KEY = "winga-mock-seed-version";
  const CATEGORIES_KEY = "winga-categories";
  const MESSAGES_KEY = "winga-messages";
  const REVIEWS_KEY = "winga-reviews";
  const LOCAL_HASH_PREFIX = "pbkdf2_sha256";

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function safeStorageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function safeStorageSet(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      return false;
    }
  }

  function setStorageOrThrow(key, value, label = "data za Winga") {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      const quotaExceeded = error?.name === "QuotaExceededError"
        || error?.code === 22
        || error?.code === 1014
        || /quota|storage|space/i.test(String(error?.message || ""));
      if (quotaExceeded) {
        throw new Error(`${label} zimezidi nafasi ya browser/simu. Punguza idadi au ukubwa wa picha kisha ujaribu tena.`);
      }
      throw new Error(`Imeshindikana kuhifadhi ${label} kwenye browser hii. Jaribu tena au fungua app upya.`);
    }
  }

  function safeStorageRemove(key) {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      // Ignore storage removal failures and continue with in-memory flow.
    }
  }

  function readStoredJson(key, fallbackValue) {
    const raw = safeStorageGet(key);
    if (!raw) {
      return fallbackValue;
    }

    try {
      return JSON.parse(raw);
    } catch (error) {
      return fallbackValue;
    }
  }

  function readStoredSession() {
    const raw = safeStorageGet(SESSION_KEY);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        safeStorageRemove(SESSION_KEY);
        return null;
      }

      const username = typeof parsed.username === "string" ? parsed.username.trim() : "";
      if (!username) {
        safeStorageRemove(SESSION_KEY);
        return null;
      }

      return {
        ...parsed,
        username,
        fullName: typeof parsed.fullName === "string" && parsed.fullName.trim() ? parsed.fullName.trim() : username,
        role: typeof parsed.role === "string" ? parsed.role.trim().toLowerCase() : "",
        primaryCategory: typeof parsed.primaryCategory === "string" ? parsed.primaryCategory.trim() : "",
        phoneNumber: typeof parsed.phoneNumber === "string" ? parsed.phoneNumber.replace(/\D/g, "").slice(0, 20) : "",
        whatsappNumber: typeof parsed.whatsappNumber === "string"
          ? parsed.whatsappNumber.replace(/\D/g, "").slice(0, 20)
          : "",
        profileImage: typeof parsed.profileImage === "string" ? parsed.profileImage.trim() : "",
        token: typeof parsed.token === "string" ? parsed.token.trim() : ""
      };
    } catch (error) {
      safeStorageRemove(SESSION_KEY);
      return null;
    }
  }

  function writeStoredSession(session) {
    safeStorageSet(SESSION_KEY, JSON.stringify(session));
  }

  function clearLegacyLocalFallbackArtifacts() {
    [
      USERS_KEY,
      PRODUCTS_KEY,
      CATEGORIES_KEY,
      MESSAGES_KEY,
      REVIEWS_KEY,
      MOCK_SEEDED_KEY,
      MOCK_SEED_VERSION_KEY
    ].forEach((key) => {
      safeStorageRemove(key);
    });
  }

  function normalizePhoneNumber(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function normalizeNationalId(value) {
    return String(value || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  }

  function normalizeIdentifier(value) {
    return String(value || "").trim().toLowerCase();
  }

  function isLocalPasswordHashed(passwordValue) {
    return typeof passwordValue === "string" && passwordValue.startsWith(`${LOCAL_HASH_PREFIX}:`);
  }

  async function hashLocalPassword(password, salt = null) {
    const cryptoApi = globalThis.crypto;
    if (!cryptoApi?.subtle) {
      return password;
    }

    const activeSalt = salt || Array.from(cryptoApi.getRandomValues(new Uint8Array(16)))
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
    const encoder = new TextEncoder();
    const keyMaterial = await cryptoApi.subtle.importKey(
      "raw",
      encoder.encode(String(password || "")),
      { name: "PBKDF2" },
      false,
      ["deriveBits"]
    );
    const derivedBits = await cryptoApi.subtle.deriveBits({
      name: "PBKDF2",
      salt: encoder.encode(activeSalt),
      iterations: 120000,
      hash: "SHA-256"
    }, keyMaterial, 256);
    const hash = Array.from(new Uint8Array(derivedBits))
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
    return `${LOCAL_HASH_PREFIX}:${activeSalt}:${hash}`;
  }

  async function verifyLocalPassword(password, passwordValue) {
    if (!passwordValue) {
      return false;
    }

    if (!isLocalPasswordHashed(passwordValue)) {
      return passwordValue === password;
    }

    const [, salt] = String(passwordValue).split(":");
    if (!salt) {
      return false;
    }

    const candidate = await hashLocalPassword(password, salt);
    return candidate === passwordValue;
  }

  function getBlockedAccountMessage(status) {
    if (status === "suspended") {
      return "Akaunti hii imesimamishwa kwa muda.";
    }
    if (status === "banned") {
      return "Akaunti hii imezuiwa kutumia Winga.";
    }
    return "Akaunti hii haiwezi kuingia kwa sasa.";
  }

  function isStaffRole(role) {
    return role === "admin" || role === "moderator";
  }

  function isBuyerCapableRole(role) {
    return role === "buyer" || role === "seller";
  }

  function buildSessionPayload(user, token = null) {
    return {
      username: user.username,
      fullName: user.fullName || user.username,
      primaryCategory: user.primaryCategory || "",
      role: user.role || "seller",
      phoneNumber: normalizePhoneNumber(user.phoneNumber || ""),
      whatsappNumber: normalizePhoneNumber(user.whatsappNumber || user.phoneNumber || ""),
      whatsappVerificationStatus: user.whatsappVerificationStatus === "pending" ? "pending" : "verified",
      whatsappVerifiedAt: user.whatsappVerifiedAt || "",
      pendingWhatsappNumber: normalizePhoneNumber(user.pendingWhatsappNumber || ""),
      pendingWhatsappExpiresAt: user.pendingWhatsappExpiresAt || "",
      profileImage: user.profileImage || "",
      verificationStatus: user.verificationStatus || "",
      verifiedSeller: Boolean(user.verifiedSeller),
      token
    };
  }

  function generateVerificationCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  function getPreferredWhatsappNumber(user = {}) {
    return normalizePhoneNumber(user.whatsappNumber || user.phoneNumber || "");
  }

  function stripSignupCategoryFields(payload = {}) {
    if (!payload || typeof payload !== "object") {
      return payload;
    }

    const {
      primaryCategory,
      category,
      subcategory,
      categoryId,
      subcategoryId,
      ...rest
    } = payload;

    return {
      ...rest,
      primaryCategory: ""
    };
  }

  function normalizePrimaryCategoryValue(value) {
    const normalized = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized) ? normalized : "";
  }

  function createLocalAdapter() {
    return {
      async loadUsers() {
        return readStoredJson(USERS_KEY, []);
      },
      async saveUsers(users) {
        setStorageOrThrow(USERS_KEY, JSON.stringify(users), "data za akaunti na picha ya profile");
      },
      async loadProducts() {
        return readStoredJson(PRODUCTS_KEY, []);
      },
        async loadCategories() {
          return readStoredJson(CATEGORIES_KEY, []);
        },
        async loadMessages() {
          return readStoredJson(MESSAGES_KEY, []);
        },
        async loadReviews() {
          const reviews = readStoredJson(REVIEWS_KEY, []);
          const summaryMap = new Map();
          reviews.forEach((review) => {
            const key = review.productId;
            if (!summaryMap.has(key)) {
              summaryMap.set(key, []);
            }
            summaryMap.get(key).push(review);
          });
          return {
            reviews,
            summaries: Array.from(summaryMap.entries()).reduce((accumulator, [productId, items]) => {
              const totalReviews = items.length;
              const averageRating = totalReviews
                ? Number((items.reduce((sum, item) => sum + Number(item.rating || 0), 0) / totalReviews).toFixed(1))
                : 0;
              accumulator[productId] = { averageRating, totalReviews };
              return accumulator;
            }, {})
          };
        },
        async saveCategories(categories) {
          setStorageOrThrow(CATEGORIES_KEY, JSON.stringify(categories), "categories za Winga");
        },
        async saveMessages(messages) {
          setStorageOrThrow(MESSAGES_KEY, JSON.stringify(messages), "messages zako");
        },
        async saveReviews(reviews) {
          setStorageOrThrow(REVIEWS_KEY, JSON.stringify(reviews), "reviews zako");
        },
        async saveProducts(products) {
          setStorageOrThrow(PRODUCTS_KEY, JSON.stringify(products), "data za bidhaa na picha zake");
        },
      loadSession() {
        return readStoredSession();
      },
      saveSession(session) {
        writeStoredSession(session);
      },
      clearSession() {
        safeStorageRemove(SESSION_KEY);
      },
      async logoutSession() {
        this.clearSession();
        return { ok: true };
      },
      async restoreSession() {
        return this.loadSession();
      },
      async signup(payload) {
        const safePayload = stripSignupCategoryFields(payload);
        const users = await this.loadUsers();
        if (safePayload.role !== "buyer" && users.find((item) => item.username === safePayload.username)) {
          throw new Error("Username hiyo tayari imetumika.");
        }

        const duplicatePhone = users.find((item) => item.phoneNumber === safePayload.phoneNumber);
        if (duplicatePhone) {
          throw new Error("Namba hiyo ya simu tayari imesajiliwa.");
        }

        const duplicateNationalId = users.find((item) => item.nationalId === safePayload.nationalId);
        if (duplicateNationalId) {
          throw new Error("Namba hiyo ya kitambulisho tayari imesajiliwa.");
        }

        if (safePayload.role === "buyer" && users.find((item) => String(item.fullName || "").toLowerCase() === String(safePayload.fullName || "").toLowerCase())) {
          throw new Error("Jina hilo tayari limetumika.");
        }

        const nextUser = {
          ...safePayload,
          username: safePayload.role === "buyer" ? `buyer-${Date.now()}` : safePayload.username,
          fullName: safePayload.fullName || safePayload.username,
          role: safePayload.role || "seller",
          primaryCategory: "",
          nationalId: normalizeNationalId(safePayload.nationalId),
          phoneNumber: normalizePhoneNumber(safePayload.phoneNumber),
          whatsappNumber: normalizePhoneNumber(safePayload.phoneNumber),
          whatsappVerificationStatus: "verified",
          whatsappVerifiedAt: new Date().toISOString(),
          password: await hashLocalPassword(safePayload.password),
          status: "active",
          verifiedSeller: safePayload.role === "seller",
          verificationStatus: safePayload.role === "seller" ? "verified" : "",
          verificationSubmittedAt: safePayload.role === "seller" ? new Date().toISOString() : "",
          createdAt: safePayload.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        users.push(nextUser);
        await this.saveUsers(users);
        return {
          username: nextUser.username,
          fullName: nextUser.fullName,
          primaryCategory: "",
          role: nextUser.role,
          phoneNumber: nextUser.phoneNumber,
          whatsappNumber: nextUser.whatsappNumber,
          whatsappVerificationStatus: nextUser.whatsappVerificationStatus,
          whatsappVerifiedAt: nextUser.whatsappVerifiedAt,
          profileImage: nextUser.profileImage || "",
          verificationStatus: nextUser.verificationStatus || "",
          verifiedSeller: Boolean(nextUser.verifiedSeller),
          token: null
        };
      },
      async login(payload) {
        const users = await this.loadUsers();
        const identifier = normalizeIdentifier(payload.identifier || payload.username);
        const phone = normalizePhoneNumber(identifier);
        const userIndex = users.findIndex((item) =>
          (normalizeIdentifier(item.username) === identifier
          || normalizeIdentifier(item.fullName) === identifier
          || normalizePhoneNumber(item.phoneNumber) === phone)
        );
        const user = userIndex >= 0 ? users[userIndex] : null;
        const passwordMatches = user ? await verifyLocalPassword(payload.password, user.password) : false;
        if (!user || !passwordMatches) {
          throw new Error("Taarifa za login si sahihi. Hakikisha username na password ni sahihi.");
        }
        if (user.status === "suspended" || user.status === "banned") {
          throw new Error(getBlockedAccountMessage(user.status));
        }
        if (isStaffRole(user.role)) {
          throw new Error("Admin au moderator wanapaswa kutumia admin login route ya Winga.");
        }
        if (!isLocalPasswordHashed(user.password)) {
          users[userIndex] = {
            ...user,
            password: await hashLocalPassword(payload.password),
            updatedAt: new Date().toISOString()
          };
          await this.saveUsers(users);
        }
        return buildSessionPayload(user);
      },
      async recoverPassword(payload) {
        const users = await this.loadUsers();
        const identifier = normalizeIdentifier(payload?.identifier || payload?.username);
        const identifierPhone = normalizePhoneNumber(payload?.identifier || payload?.username || "");
        const phone = normalizePhoneNumber(payload?.phoneNumber || "");
        const nationalId = normalizeNationalId(payload?.nationalId || "");
        const nextPassword = String(payload?.newPassword || payload?.password || "");
        const userIndex = users.findIndex((item) =>
          normalizeIdentifier(item.username) === identifier
          || normalizeIdentifier(item.fullName) === identifier
          || normalizePhoneNumber(item.phoneNumber) === identifierPhone
        );
        const user = userIndex >= 0 ? users[userIndex] : null;
        const phoneMatches = user && (
          normalizePhoneNumber(user.phoneNumber) === phone
          || normalizePhoneNumber(user.whatsappNumber) === phone
        );
        const idMatches = user && normalizeNationalId(user.nationalId || user.identityDocumentNumber) === nationalId;
        if (!user || isStaffRole(user.role) || !phoneMatches || !idMatches) {
          throw new Error("Taarifa za kurejesha password hazijalingana na akaunti hii.");
        }
        if (nextPassword.length < 6) {
          throw new Error("Password mpya inapaswa kuwa na angalau herufi 6.");
        }
        users[userIndex] = {
          ...user,
          password: await hashLocalPassword(nextPassword),
          updatedAt: new Date().toISOString()
        };
        await this.saveUsers(users);
        this.clearSession();
        return { ok: true };
      },
      async adminLogin(payload) {
        const users = await this.loadUsers();
        const identifier = normalizeIdentifier(payload.identifier || payload.username);
        const phone = normalizePhoneNumber(identifier);
        const userIndex = users.findIndex((item) =>
          (normalizeIdentifier(item.username) === identifier
          || normalizeIdentifier(item.fullName) === identifier
          || normalizePhoneNumber(item.phoneNumber) === phone)
        );
        const user = userIndex >= 0 ? users[userIndex] : null;
        const passwordMatches = user ? await verifyLocalPassword(payload.password, user.password) : false;
        if (!user || !passwordMatches || !isStaffRole(user.role)) {
          throw new Error("Taarifa za admin login si sahihi.");
        }
        if (user.status === "suspended" || user.status === "banned") {
          throw new Error(getBlockedAccountMessage(user.status));
        }
        if (!isLocalPasswordHashed(user.password)) {
          users[userIndex] = {
            ...user,
            password: await hashLocalPassword(payload.password),
            updatedAt: new Date().toISOString()
          };
          await this.saveUsers(users);
        }
        return buildSessionPayload(user);
      },
      async updateUserProfile(payload) {
        const session = this.loadSession();
        if (!session?.username) {
          throw new Error("Ingia kwanza kabla ya kubadilisha profile.");
        }
        const users = await this.loadUsers();
        let updatedUser = null;
        const nextUsers = users.map((item) => {
          if (item.username !== session.username) {
            return item;
          }
          updatedUser = {
            ...item,
            profileImage: payload?.profileImage || "",
            updatedAt: new Date().toISOString()
          };
          return updatedUser;
        });
        if (!updatedUser) {
          throw new Error("Akaunti yako haikupatikana tena. Ingia upya kabla ya kujaribu tena.");
        }
        await this.saveUsers(nextUsers);
        return {
          username: updatedUser.username,
          fullName: updatedUser.fullName || updatedUser.username,
          primaryCategory: updatedUser.primaryCategory || "",
          role: updatedUser.role || "seller",
          phoneNumber: updatedUser.phoneNumber || "",
          whatsappNumber: updatedUser.whatsappNumber || updatedUser.phoneNumber || "",
          whatsappVerificationStatus: updatedUser.whatsappVerificationStatus || "verified",
          whatsappVerifiedAt: updatedUser.whatsappVerifiedAt || "",
          pendingWhatsappNumber: updatedUser.pendingWhatsappNumber || "",
          pendingWhatsappExpiresAt: updatedUser.pendingWhatsappExpiresAt || "",
          profileImage: updatedUser.profileImage || "",
          verificationStatus: updatedUser.verificationStatus || "",
          token: session.token || null
        };
      },
      async upgradeBuyerToSeller(payload) {
        const session = this.loadSession();
        if (!session?.username) {
          throw new Error("Ingia kwanza kabla ya kuupgrade account.");
        }
        const users = await this.loadUsers();
        let updatedUser = null;
        const nextUsers = users.map((item) => {
          if (item.username !== session.username) {
            return item;
          }
          const nextNationalId = normalizeNationalId(payload?.identityDocumentNumber || payload?.nationalId || item.nationalId || item.identityDocumentNumber || "");
          updatedUser = {
            ...item,
            fullName: String(payload?.fullName || item.fullName || item.username).trim() || item.username,
            primaryCategory: normalizePrimaryCategoryValue(payload?.primaryCategory || item.primaryCategory || ""),
            role: "seller",
            nationalId: nextNationalId,
            identityDocumentType: String(payload?.identityDocumentType || "").toUpperCase(),
            identityDocumentNumber: nextNationalId,
            identityDocumentImage: payload?.identityDocumentImage || "",
            verifiedSeller: true,
            verificationStatus: "verified",
            verificationSubmittedAt: item.verificationSubmittedAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          return updatedUser;
        });
        if (!updatedUser) {
          throw new Error("Akaunti yako haikupatikana tena. Ingia upya kabla ya kujaribu tena.");
        }
        await this.saveUsers(nextUsers);
        const refreshedSession = buildSessionPayload(updatedUser, session.token || null);
        this.saveSession(refreshedSession);
        return refreshedSession;
      },
      async updateUserPrimaryCategory(username, primaryCategory) {
        const normalizedCategory = normalizePrimaryCategoryValue(primaryCategory);
        const users = await this.loadUsers();
        const nextUsers = users.map((item) =>
          item.username === username ? { ...item, primaryCategory: normalizedCategory } : item
        );
        await this.saveUsers(nextUsers);
      },
      async addCategory(category) {
        const categories = await this.loadCategories();
        if (!categories.find((item) => item.value === category.value)) {
          categories.push(category);
          await this.saveCategories(categories);
        }
        return category;
      },
      async createProduct(product) {
        const session = this.loadSession();
        const users = await this.loadUsers();
        const owner = users.find((item) => item.username === session?.username);
        const whatsapp = getPreferredWhatsappNumber(owner || session || {});
        const products = await this.loadProducts();
        const nextProducts = [{ ...product, whatsapp, status: product?.status || "approved" }, ...products];
        await this.saveProducts(nextProducts);
        return nextProducts[0];
      },
      async updateProduct(productId, payload) {
        const session = this.loadSession();
        const users = await this.loadUsers();
        const owner = users.find((item) => item.username === session?.username);
        const whatsapp = getPreferredWhatsappNumber(owner || session || {});
        const products = await this.loadProducts();
        let updatedProduct = null;
        const nextProducts = products.map((item) => {
          if (item.id !== productId) {
            return item;
          }
          updatedProduct = { ...item, ...payload, whatsapp, id: item.id, uploadedBy: item.uploadedBy };
          return updatedProduct;
        });
        await this.saveProducts(nextProducts);
        return updatedProduct;
      },
      async requestWhatsappChange(payload) {
        const session = this.loadSession();
        if (!session?.username) {
          throw new Error("Ingia kwanza kabla ya kubadilisha WhatsApp number.");
        }
        const nextWhatsappNumber = normalizePhoneNumber(payload?.whatsappNumber || "");
        if (!/^\d{10,15}$/.test(nextWhatsappNumber)) {
          throw new Error("Weka namba mpya ya WhatsApp sahihi.");
        }
        const users = await this.loadUsers();
        const currentUser = users.find((item) => item.username === session.username);
        if (!currentUser) {
          throw new Error("Akaunti yako haikupatikana tena. Ingia upya kabla ya kujaribu tena.");
        }
        const activeWhatsappNumber = getPreferredWhatsappNumber(currentUser);
        if (nextWhatsappNumber === activeWhatsappNumber) {
          throw new Error("Namba hiyo tayari ndiyo WhatsApp number ya account yako.");
        }
        const conflictingUser = users.find((item) =>
          item.username !== session.username
          && (
            normalizePhoneNumber(item.phoneNumber || "") === nextWhatsappNumber
            || normalizePhoneNumber(item.whatsappNumber || "") === nextWhatsappNumber
            || normalizePhoneNumber(item.pendingWhatsappNumber || "") === nextWhatsappNumber
          )
        );
        if (conflictingUser) {
          throw new Error("Namba hiyo tayari inatumika kwenye account nyingine.");
        }
        const previewCode = generateVerificationCode();
        const expiresAt = new Date(Date.now() + (10 * 60 * 1000)).toISOString();
        const nextUsers = users.map((item) =>
          item.username === session.username
            ? {
                ...item,
                pendingWhatsappNumber: nextWhatsappNumber,
                pendingWhatsappCode: previewCode,
                pendingWhatsappExpiresAt: expiresAt,
                whatsappVerificationStatus: "pending",
                updatedAt: new Date().toISOString()
              }
            : item
        );
        await this.saveUsers(nextUsers);
        return {
          ok: true,
          pendingWhatsappNumber: nextWhatsappNumber,
          expiresAt,
          deliveryMode: "preview",
          previewCode
        };
      },
      async verifyWhatsappChange(payload) {
        const session = this.loadSession();
        if (!session?.username) {
          throw new Error("Ingia kwanza kabla ya kuthibitisha WhatsApp number.");
        }
        const code = String(payload?.code || "").trim();
        if (!/^\d{6}$/.test(code)) {
          throw new Error("Weka verification code ya tarakimu 6.");
        }
        const users = await this.loadUsers();
        const currentUser = users.find((item) => item.username === session.username);
        if (!currentUser) {
          throw new Error("Akaunti yako haikupatikana tena. Ingia upya kabla ya kujaribu tena.");
        }
        if (!currentUser.pendingWhatsappNumber || !currentUser.pendingWhatsappCode || !currentUser.pendingWhatsappExpiresAt) {
          throw new Error("Hakuna mabadiliko ya WhatsApp yanayosubiri verification.");
        }
        if (new Date(currentUser.pendingWhatsappExpiresAt).getTime() < Date.now()) {
          throw new Error("Verification code imeexpire. Omba code mpya ya WhatsApp.");
        }
        if (currentUser.pendingWhatsappCode !== code) {
          throw new Error("Verification code ya WhatsApp si sahihi.");
        }
        const now = new Date().toISOString();
        const verifiedWhatsappNumber = normalizePhoneNumber(currentUser.pendingWhatsappNumber);
        const nextUsers = users.map((item) =>
          item.username === session.username
            ? {
                ...item,
                whatsappNumber: verifiedWhatsappNumber,
                whatsappVerificationStatus: "verified",
                whatsappVerifiedAt: now,
                pendingWhatsappNumber: "",
                pendingWhatsappCode: "",
                pendingWhatsappExpiresAt: "",
                updatedAt: now
              }
            : item
        );
        await this.saveUsers(nextUsers);
        const products = await this.loadProducts();
        const nextProducts = products.map((item) =>
          item.uploadedBy === session.username
            ? { ...item, whatsapp: verifiedWhatsappNumber }
            : item
        );
        await this.saveProducts(nextProducts);
        return buildSessionPayload({
          ...currentUser,
          whatsappNumber: verifiedWhatsappNumber,
          whatsappVerificationStatus: "verified",
          whatsappVerifiedAt: now,
          pendingWhatsappNumber: "",
          pendingWhatsappExpiresAt: ""
        }, session.token || null);
      },
      async deleteProduct(productId) {
        const products = await this.loadProducts();
        const nextProducts = products.filter((item) => item.id !== productId);
        await this.saveProducts(nextProducts);
      },
        async loadAnalytics() {
          return null;
        },
        async loadMessages() {
          const session = this.loadSession();
          const messages = readStoredJson(MESSAGES_KEY, []);
          if (!session?.username) {
            return [];
          }
          return messages.filter((item) =>
            item.senderId === session.username || item.receiverId === session.username
          );
        },
        async sendMessage(payload) {
          const session = this.loadSession();
          if (!session?.username) {
            throw new Error("Ingia kwanza kabla ya kutuma ujumbe.");
          }
          if (!payload?.receiverId || (!payload?.message && !(Array.isArray(payload?.productItems) && payload.productItems.length))) {
            throw new Error("Receiver na ujumbe au bidhaa vinahitajika.");
          }
          const messages = readStoredJson(MESSAGES_KEY, []);
          const normalizedMessage = String(payload.message || "").trim();
          const duplicateWindowMs = 8000;
          const recentDuplicate = messages.find((item) =>
            item.senderId === session.username
            && item.receiverId === payload.receiverId
            && (item.productId || "") === (payload.productId || "")
            && String(item.message || "").trim() === normalizedMessage
            && (Date.now() - new Date(item.createdAt || item.timestamp || 0).getTime()) < duplicateWindowMs
          );
          if (recentDuplicate) {
            throw new Error("Subiri kidogo kabla ya kutuma ujumbe ule ule tena.");
          }
          const nextMessage = {
            id: `msg-${Date.now()}`,
            senderId: session.username,
            receiverId: payload.receiverId,
            messageType: payload.messageType || (Array.isArray(payload.productItems) && payload.productItems.length > 1 ? "product_inquiry" : Array.isArray(payload.productItems) && payload.productItems.length === 1 ? "product_reference" : "text"),
            productId: payload.productId || "",
            productName: payload.productName || "",
            productItems: Array.isArray(payload.productItems) ? payload.productItems : [],
            replyToMessageId: payload.replyToMessageId || "",
            message: payload.message || "",
            timestamp: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deliveredAt: new Date().toISOString(),
            readAt: "",
            isDelivered: true,
            isRead: false
          };
          messages.push(nextMessage);
          await this.saveMessages(messages);
          return nextMessage;
        },
        async deleteMessage(messageId) {
          const session = this.loadSession();
          const messages = readStoredJson(MESSAGES_KEY, []);
          const targetMessage = messages.find((item) => item.id === messageId);
          if (!targetMessage || targetMessage.senderId !== session?.username) {
            throw new Error("Huwezi kufuta ujumbe huu.");
          }
          await this.saveMessages(messages.filter((item) => item.id !== messageId));
          return { ok: true };
        },
        async createReview(payload) {
          const session = this.loadSession();
          if (!session?.username) {
            throw new Error("Ingia kwanza kabla ya ku-review.");
          }
          if (!Number.isInteger(Number(payload?.rating)) || Number(payload.rating) < 1 || Number(payload.rating) > 5) {
            throw new Error("Rating inapaswa kuwa kati ya 1 na 5.");
          }
          if (!String(payload?.comment || "").trim() || String(payload.comment || "").trim().length < 3) {
            throw new Error("Review lazima iwe na maoni mafupi yenye maana.");
          }
          const reviews = readStoredJson(REVIEWS_KEY, []);
          const duplicate = reviews.find((item) => item.productId === payload.productId && item.userId === session.username);
          if (duplicate) {
            throw new Error("Tayari ume-review bidhaa hii.");
          }
          const nextReview = {
            id: `review-${Date.now()}`,
            userId: session.username,
            productId: payload.productId,
            sellerId: payload.sellerId || "",
            rating: Number(payload.rating),
            comment: payload.comment,
            verifiedBuyer: true,
            date: new Date().toISOString()
          };
          reviews.unshift(nextReview);
          await this.saveReviews(reviews);
          return nextReview;
        },
        async loadMyOrders() {
          return { purchases: [], sales: [] };
        },
      async createOrder() {
        throw new Error("Order flow inapatikana kwenye API mode tu.");
      },
      async loadAdminUsers() {
        return [];
      },
      async loadAdminProducts() {
        return [];
      },
      async loadAdminOrders() {
        return [];
      },
      async loadAdminPayments() {
        return [];
      },
      async createReport() {
        throw new Error("Reporting inapatikana kwenye API mode tu.");
      },
      async loadAdminReports() {
        return [];
      },
      async reviewReport() {
        throw new Error("Report review inapatikana kwenye API mode tu.");
      },
      async loadAdminUserInvestigation() {
        throw new Error("Fraud review inapatikana kwenye API mode tu.");
      },
      async moderateUser() {
        throw new Error("User moderation inapatikana kwenye API mode tu.");
      },
      async loadModerationActions() {
        return [];
      },
      async logClientEvent() {
        return null;
      },
      async moderateProduct() {
        throw new Error("Moderation inapatikana kwenye API mode tu.");
      },
      async likeProduct(productId) {
        const products = await this.loadProducts();
        const nextProducts = products.map((item) =>
          item.id === productId ? { ...item, likes: Number(item.likes || 0) + 1 } : item
        );
        await this.saveProducts(nextProducts);
      },
      async trackProductView(productId) {
        const session = this.loadSession();
        const products = await this.loadProducts();
        const nextProducts = products.map((item) => {
          if (item.id !== productId) {
            return item;
          }
          const viewedBy = Array.isArray(item.viewedBy) ? item.viewedBy : [];
          if (!session?.username || viewedBy.includes(session.username)) {
            return item;
          }
          return {
            ...item,
            views: Number(item.views || 0) + 1,
            viewedBy: [...viewedBy, session.username]
          };
        });
        await this.saveProducts(nextProducts);
      }
    };
  }

  function createMockAdapter() {
    const local = createLocalAdapter();

    function mergeSeedUsers(currentUsers, seedUsers) {
      const merged = new Map();
      (Array.isArray(currentUsers) ? currentUsers : []).forEach((user) => {
        if (user?.username) {
          merged.set(user.username, user);
        }
      });
      (Array.isArray(seedUsers) ? seedUsers : []).forEach((user) => {
        if (!user?.username) {
          return;
        }
        const existingUser = merged.get(user.username) || {};
        merged.set(user.username, {
          ...user,
          ...existingUser,
          profileImage: existingUser.profileImage || user.profileImage || "",
          primaryCategory: existingUser.primaryCategory || user.primaryCategory || ""
        });
      });
      return Array.from(merged.values());
    }

    function mergeSeedProducts(currentProducts, seedProducts) {
      const merged = new Map();
      (Array.isArray(currentProducts) ? currentProducts : []).forEach((product) => {
        if (product?.id) {
          merged.set(product.id, product);
        }
      });
      (Array.isArray(seedProducts) ? seedProducts : []).forEach((product) => {
        if (!product?.id) {
          return;
        }
        const existingProduct = merged.get(product.id) || {};
        const existingImages = Array.isArray(existingProduct.images)
          ? existingProduct.images.filter(Boolean)
          : [];
        const seedImages = Array.isArray(product.images)
          ? product.images.filter(Boolean)
          : [];
        merged.set(product.id, {
          ...product,
          ...existingProduct,
          image: existingProduct.image || product.image || "",
          images: existingImages.length ? existingImages : seedImages,
          category: existingProduct.category || product.category || "",
          shop: existingProduct.shop || product.shop || "",
          whatsapp: existingProduct.whatsapp || product.whatsapp || "",
          uploadedBy: existingProduct.uploadedBy || product.uploadedBy || "",
          likes: Number(existingProduct.likes ?? product.likes ?? 0),
          views: Number(existingProduct.views ?? product.views ?? 0),
          viewedBy: Array.isArray(existingProduct.viewedBy) ? existingProduct.viewedBy : (product.viewedBy || [])
        });
      });
      return Array.from(merged.values());
    }

    function mergeSeedCategories(currentCategories, seedCategories) {
      const merged = new Map();
      (Array.isArray(currentCategories) ? currentCategories : []).forEach((category) => {
        if (category?.value) {
          merged.set(category.value, category);
        }
      });
      (Array.isArray(seedCategories) ? seedCategories : []).forEach((category) => {
        if (category?.value) {
          merged.set(category.value, {
            ...category,
            ...(merged.get(category.value) || {})
          });
        }
      });
      return Array.from(merged.values());
    }

    async function ensureMockSeed() {
      const seedUsers = window.WingaMockData?.users || [];
      const seedProducts = window.WingaMockData?.products || [];
      const seedCategories = window.WingaMockData?.categories || [];
      const seedVersion = window.WingaMockData?.seedVersion || "legacy";
      const currentUsers = await local.loadUsers();
      const currentProducts = await local.loadProducts();
      const currentCategories = await local.loadCategories();
      const currentSeedVersion = safeStorageGet(MOCK_SEED_VERSION_KEY) || "";
      const hasEnoughProducts = Array.isArray(currentProducts) && currentProducts.length >= Math.max(4, Math.min(seedProducts.length, 6));
      const hasSeedCoverage = Array.isArray(currentProducts)
        && seedProducts.some((product) => currentProducts.some((item) => item?.id === product.id));
      const shouldSeed = !safeStorageGet(MOCK_SEEDED_KEY)
        || currentSeedVersion !== seedVersion
        || !Array.isArray(currentUsers) || currentUsers.length === 0
        || !hasEnoughProducts
        || !hasSeedCoverage
        || !Array.isArray(currentCategories) || currentCategories.length === 0;

      if (!shouldSeed) {
        return;
      }

      const mergedUsers = mergeSeedUsers(currentUsers, seedUsers);
      const mergedProducts = mergeSeedProducts(currentProducts, seedProducts);
      const mergedCategories = mergeSeedCategories(currentCategories, seedCategories);
      safeStorageSet(USERS_KEY, JSON.stringify(mergedUsers));
      safeStorageSet(PRODUCTS_KEY, JSON.stringify(mergedProducts));
      safeStorageSet(CATEGORIES_KEY, JSON.stringify(mergedCategories));
      safeStorageSet(MOCK_SEEDED_KEY, "true");
      safeStorageSet(MOCK_SEED_VERSION_KEY, seedVersion);
    }

    return {
      async loadUsers() {
        await ensureMockSeed();
        return local.loadUsers();
      },
      async saveUsers(users) {
        await local.saveUsers(users);
      },
      async loadProducts() {
        await ensureMockSeed();
        return local.loadProducts();
      },
      async loadCategories() {
        await ensureMockSeed();
        return local.loadCategories();
      },
      async saveCategories(categories) {
        await local.saveCategories(categories);
      },
      async saveProducts(products) {
        await local.saveProducts(products);
      },
      loadSession() {
        return local.loadSession();
      },
      saveSession(session) {
        local.saveSession(session);
      },
      clearSession() {
        local.clearSession();
      },
      async logoutSession(token) {
        return local.logoutSession(token);
      },
      async restoreSession() {
        return local.restoreSession();
      },
      async signup(payload) {
        return local.signup(payload);
      },
      async login(payload) {
        return local.login(payload);
      },
      async adminLogin(payload) {
        return local.adminLogin(payload);
      },
      async updateUserPrimaryCategory(username, primaryCategory) {
        return local.updateUserPrimaryCategory(username, primaryCategory);
      },
      async addCategory(category) {
        return local.addCategory(category);
      },
      async createProduct(product) {
        return local.createProduct(product);
      },
      async updateProduct(productId, payload) {
        return local.updateProduct(productId, payload);
      },
      async deleteProduct(productId) {
        return local.deleteProduct(productId);
      },
        async loadAnalytics() {
          return local.loadAnalytics();
        },
        async loadMessages() {
          return local.loadMessages();
        },
        async sendMessage(payload) {
          return local.sendMessage(payload);
        },
        async deleteMessage(messageId) {
          return local.deleteMessage(messageId);
        },
        async loadReviews() {
          return local.loadReviews();
        },
        async createReview(payload) {
          return local.createReview(payload);
        },
        async loadMyOrders() {
          return local.loadMyOrders();
        },
      async createOrder(payload) {
        return local.createOrder(payload);
      },
      async loadAdminUsers() {
        return local.loadAdminUsers();
      },
      async loadAdminProducts(status) {
        return local.loadAdminProducts(status);
      },
      async loadAdminPayments(filters) {
        return local.loadAdminPayments(filters);
      },
      async createReport(payload) {
        return local.createReport(payload);
      },
      async loadAdminReports(filters) {
        return local.loadAdminReports(filters);
      },
      async reviewReport(reportId, payload) {
        return local.reviewReport(reportId, payload);
      },
      async loadAdminUserInvestigation(username, payload) {
        return local.loadAdminUserInvestigation(username, payload);
      },
      async moderateUser(username, payload) {
        return local.moderateUser(username, payload);
      },
      async loadModerationActions() {
        return local.loadModerationActions();
      },
      async moderateProduct(productId, payload) {
        return local.moderateProduct(productId, payload);
      },
      async likeProduct(productId) {
        return local.likeProduct(productId);
      },
      async trackProductView(productId) {
        return local.trackProductView(productId);
      }
    };
  }

  async function fetchJson(url, options) {
    const requestOptions = options ? { ...options } : {};
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutMs = Number(
      requestOptions.timeoutMs
      || window.WINGA_CONFIG?.requestTimeoutMs
      || 25000
    );
    delete requestOptions.timeoutMs;
    const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    let response;
    try {
      response = await fetch(url, {
        ...requestOptions,
        signal: controller ? controller.signal : undefined
      });
    } catch (error) {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (error?.name === "AbortError") {
        const endpoint = String(url || "");
        if (endpoint.includes("/auth/signup")) {
          throw new Error("Seller signup took too long. Check your connection and try again.");
        }
        if (endpoint.includes("/auth/admin-login")) {
          throw new Error("Admin login took too long. Check your connection and try again.");
        }
        if (endpoint.includes("/auth/login")) {
          throw new Error("Login took too long. Check your connection and try again.");
        }
        throw new Error("Request took too long. Check your connection and try again.");
      }
      throw error;
    }
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    if (!response.ok) {
      let errorMessage = `Request failed: ${response.status}`;
      try {
        const errorBody = await response.json();
        if (errorBody?.error) {
          errorMessage = errorBody.error;
        }
      } catch (error) {
        // Ignore JSON parse failures and keep fallback message.
      }
      const normalizedMessage = String(errorMessage || "").toLowerCase();
      const shouldInvalidateSession = response.status === 401
        ? normalizedMessage.includes("session")
          || normalizedMessage.includes("imeisha")
          || normalizedMessage.includes("hakupatikana")
        : response.status === 403
          && (
            normalizedMessage.includes("imesimamishwa")
            || normalizedMessage.includes("imezuiwa")
            || normalizedMessage.includes("imezimwa")
            || normalizedMessage.includes("staff accounts")
          );
      if (shouldInvalidateSession) {
        safeStorageRemove(SESSION_KEY);
        if (typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof window.CustomEvent === "function") {
          window.dispatchEvent(new window.CustomEvent("winga:session-invalidated", {
            detail: {
              status: response.status,
              message: errorMessage
            }
          }));
        }
      }
      throw new Error(errorMessage);
    }
    return response.status === 204 ? null : response.json();
  }

  function createApiAdapter(config) {
    const baseUrl = (config.apiBaseUrl || "http://localhost:3000/api").replace(/\/$/, "");
    const publicBaseUrl = baseUrl.replace(/\/api$/, "");
    const sessionAdapter = createLocalAdapter();
    const localFallbackAdapter = createLocalAdapter();

    function resolveProductImages(product) {
      if (!product || typeof product !== "object") {
        return product;
      }

      const resolveImage = (value) => {
        if (typeof value === "string" && value.startsWith("/uploads/")) {
          return `${publicBaseUrl}${value}`;
        }
        return value;
      };

      return {
        ...product,
        image: resolveImage(product.image),
        images: Array.isArray(product.images) ? product.images.map(resolveImage) : []
      };
    }

    function createAuthHeaders() {
      const session = sessionAdapter.loadSession();
      if (session?.token) {
        return {
          Authorization: `Bearer ${session.token}`
        };
      }
      return {};
    }

    return {
      async loadUsers() {
        const data = await fetchJson(`${baseUrl}/users`, {
          headers: {
            ...createAuthHeaders()
          }
        });
        return Array.isArray(data) ? data : [];
      },
      async saveUsers(users) {
        await fetchJson(`${baseUrl}/users`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...createAuthHeaders()
          },
          body: JSON.stringify(users)
        });
      },
      async loadProducts() {
        const data = await fetchJson(`${baseUrl}/products`, {
          headers: {
            ...createAuthHeaders()
          }
        });
        return Array.isArray(data) ? data.map(resolveProductImages) : [];
      },
      async loadCategories() {
        const data = await fetchJson(`${baseUrl}/categories`);
        return Array.isArray(data) ? data : [];
      },
      async saveCategories() {
        return null;
      },
      async saveProducts(products) {
        await fetchJson(`${baseUrl}/products`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...createAuthHeaders()
          },
          body: JSON.stringify(products)
        });
      },
      loadSession() {
        return sessionAdapter.loadSession();
      },
      saveSession(session) {
        sessionAdapter.saveSession(session);
      },
      clearSession() {
        sessionAdapter.clearSession();
      },
      async logoutSession(tokenOverride = "") {
        const session = sessionAdapter.loadSession();
        const token = String(tokenOverride || session?.token || "").trim();
        if (!token) {
          sessionAdapter.clearSession();
          return { ok: true };
        }
        try {
          return await fetchJson(`${baseUrl}/auth/logout`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`
            }
          });
        } finally {
          sessionAdapter.clearSession();
        }
      },
      async restoreSession() {
        const session = sessionAdapter.loadSession();
        if (!session?.token) {
          sessionAdapter.clearSession();
          return null;
        }

        try {
          const data = await fetchJson(`${baseUrl}/auth/session`, {
            headers: {
              ...createAuthHeaders()
            },
            timeoutMs: Number(window.WINGA_CONFIG?.sessionRestoreTimeoutMs || 12000)
          });
          if (!data || typeof data !== "object" || Array.isArray(data) || !String(data.username || "").trim()) {
            sessionAdapter.clearSession();
            return null;
          }
          return data;
        } catch (error) {
          sessionAdapter.clearSession();
          return null;
        }
      },
      async signup(payload) {
        try {
          return await fetchJson(`${baseUrl}/auth/signup`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(stripSignupCategoryFields(payload))
          });
        } catch (error) {
          if (!isRetryableBootError(error)) {
            throw error;
          }
          return localFallbackAdapter.signup(payload);
        }
      },
      async login(payload) {
        try {
          return await fetchJson(`${baseUrl}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
        } catch (error) {
          if (!isRetryableBootError(error)) {
            throw error;
          }
          return localFallbackAdapter.login(payload);
        }
      },
      async recoverPassword(payload) {
        try {
          return await fetchJson(`${baseUrl}/auth/recover-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
        } catch (error) {
          if (!isRetryableBootError(error)) {
            throw error;
          }
          return localFallbackAdapter.recoverPassword(payload);
        }
      },
      async adminLogin(payload) {
        try {
          return await fetchJson(`${baseUrl}/auth/admin-login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
        } catch (error) {
          if (!isRetryableBootError(error)) {
            throw error;
          }
          return localFallbackAdapter.adminLogin(payload);
        }
      },
      async updateUserProfile(payload) {
        return fetchJson(`${baseUrl}/users/me/profile`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...createAuthHeaders()
          },
          body: JSON.stringify(payload)
        });
      },
      async upgradeBuyerToSeller(payload) {
        return fetchJson(`${baseUrl}/users/me/upgrade-to-seller`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...createAuthHeaders()
          },
          body: JSON.stringify(payload)
        });
      },
      async requestWhatsappChange(payload) {
        return fetchJson(`${baseUrl}/users/me/whatsapp/request-change`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...createAuthHeaders()
          },
          body: JSON.stringify(payload)
        });
      },
      async verifyWhatsappChange(payload) {
        return fetchJson(`${baseUrl}/users/me/whatsapp/verify-change`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...createAuthHeaders()
          },
          body: JSON.stringify(payload)
        });
      },
      async updateUserPrimaryCategory(username, primaryCategory) {
        const normalizedCategory = normalizePrimaryCategoryValue(primaryCategory);
        if (!normalizedCategory) {
          return { ok: true, ignored: true };
        }
        await fetchJson(`${baseUrl}/users/primary-category`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...createAuthHeaders()
          },
          body: JSON.stringify({ username, primaryCategory: normalizedCategory })
        });
      },
      async addCategory(category) {
        return fetchJson(`${baseUrl}/categories`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...createAuthHeaders()
          },
          body: JSON.stringify(category)
        });
      },
      async createProduct(product) {
        const result = await fetchJson(`${baseUrl}/products`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...createAuthHeaders()
          },
          body: JSON.stringify(product)
        });
        return resolveProductImages(result);
      },
      async updateProduct(productId, payload) {
        const result = await fetchJson(`${baseUrl}/products/${encodeURIComponent(productId)}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...createAuthHeaders()
          },
          body: JSON.stringify(payload)
        });
        return resolveProductImages(result);
      },
      async deleteProduct(productId) {
        return fetchJson(`${baseUrl}/products/${encodeURIComponent(productId)}`, {
          method: "DELETE",
          headers: {
            ...createAuthHeaders()
          }
        });
      },
        async loadAnalytics() {
          return fetchJson(`${baseUrl}/analytics/summary`, {
            headers: {
              ...createAuthHeaders()
            }
          });
        },
        async loadMessages() {
          const data = await fetchJson(`${baseUrl}/messages`, {
            headers: {
              ...createAuthHeaders()
            }
          });
          return Array.isArray(data) ? data : [];
        },
        async sendMessage(payload) {
          return fetchJson(`${baseUrl}/messages`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...createAuthHeaders()
            },
            body: JSON.stringify(payload)
          });
        },
        async deleteMessage(messageId) {
          return fetchJson(`${baseUrl}/messages/${encodeURIComponent(messageId)}`, {
            method: "DELETE",
            headers: {
              ...createAuthHeaders()
            }
          });
        },
        async markConversationRead(payload) {
          return fetchJson(`${baseUrl}/messages/read`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              ...createAuthHeaders()
            },
            body: JSON.stringify(payload)
          });
        },
        async loadNotifications() {
          const data = await fetchJson(`${baseUrl}/notifications`, {
            headers: {
              ...createAuthHeaders()
            }
          });
          return Array.isArray(data) ? data : [];
        },
        async markNotificationRead(notificationId) {
          return fetchJson(`${baseUrl}/notifications/${encodeURIComponent(notificationId)}/read`, {
            method: "PATCH",
            headers: {
              ...createAuthHeaders()
            }
          });
        },
        async loadPromotions() {
          const data = await fetchJson(`${baseUrl}/promotions`, {
            headers: {
              ...createAuthHeaders()
            }
          });
          return Array.isArray(data) ? data : [];
        },
        async createPromotion(payload) {
          return fetchJson(`${baseUrl}/promotions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...createAuthHeaders()
            },
            body: JSON.stringify(payload)
          });
        },
      async loadAdminPromotions() {
        const data = await fetchJson(`${baseUrl}/admin/promotions`, {
          headers: {
            ...createAuthHeaders()
          }
        });
        return Array.isArray(data) ? data : [];
      },
      async loadAdminOpsSummary() {
        return fetchJson(`${baseUrl}/admin/ops/summary`, {
          headers: {
            ...createAuthHeaders()
          }
        });
      },
      async disablePromotion(promotionId) {
        return fetchJson(`${baseUrl}/admin/promotions/${encodeURIComponent(promotionId)}/disable`, {
          method: "PATCH",
            headers: {
              ...createAuthHeaders()
            }
          });
        },
        openRealtimeChannel(handlers = {}) {
          const session = sessionAdapter.loadSession();
          if (!session?.token || typeof EventSource === "undefined") {
            return null;
          }

          const streamUrl = `${baseUrl}/messages/stream?token=${encodeURIComponent(session.token)}`;
          const source = new EventSource(streamUrl);
          const parseEvent = (event) => {
            try {
              return event?.data ? JSON.parse(event.data) : null;
            } catch (error) {
              return null;
            }
          };

          source.addEventListener("message", (event) => {
            handlers.onMessage?.(parseEvent(event));
          });
          source.addEventListener("notification", (event) => {
            handlers.onNotification?.(parseEvent(event));
          });
          source.addEventListener("message_read", (event) => {
            handlers.onMessageRead?.(parseEvent(event));
          });
          source.addEventListener("conversation_read", (event) => {
            handlers.onConversationRead?.(parseEvent(event));
          });
          source.addEventListener("users", (event) => {
            handlers.onUsers?.(parseEvent(event));
          });
          source.onerror = () => {
            handlers.onError?.();
          };

          return {
            close() {
              source.close();
            }
          };
        },
        async loadReviews(productId = "") {
          const suffix = productId ? `?productId=${encodeURIComponent(productId)}` : "";
          return fetchJson(`${baseUrl}/reviews${suffix}`);
        },
        async createReview(payload) {
          return fetchJson(`${baseUrl}/reviews`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...createAuthHeaders()
            },
            body: JSON.stringify(payload)
          });
        },
        async loadMyOrders() {
          return fetchJson(`${baseUrl}/orders/mine`, {
            headers: {
            ...createAuthHeaders()
          }
        });
      },
      async createOrder(payload) {
        return fetchJson(`${baseUrl}/orders`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...createAuthHeaders()
          },
          body: JSON.stringify(payload)
        });
      },
      async updateOrderStatus(orderId, payload) {
        return fetchJson(`${baseUrl}/orders/${encodeURIComponent(orderId)}/status`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...createAuthHeaders()
          },
          body: JSON.stringify(payload)
        });
      },
      async updateProductAvailability(productId, payload) {
        return fetchJson(`${baseUrl}/products/${encodeURIComponent(productId)}/availability`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...createAuthHeaders()
          },
          body: JSON.stringify(payload)
        });
      },
      async loadAdminUsers() {
        const data = await fetchJson(`${baseUrl}/admin/users`, {
          headers: {
            ...createAuthHeaders()
          }
        });
        return Array.isArray(data) ? data : [];
      },
      async loadAdminProducts(status = "") {
        const suffix = status ? `?status=${encodeURIComponent(status)}` : "";
        const data = await fetchJson(`${baseUrl}/admin/products${suffix}`, {
          headers: {
            ...createAuthHeaders()
          }
        });
        return Array.isArray(data) ? data.map(resolveProductImages) : [];
      },
      async loadAdminOrders(filters = {}) {
        const params = new URLSearchParams();
        if (filters.paymentStatus) {
          params.set("paymentStatus", filters.paymentStatus);
        }
        if (filters.status) {
          params.set("status", filters.status);
        }
        const suffix = params.toString() ? `?${params.toString()}` : "";
        const data = await fetchJson(`${baseUrl}/admin/orders${suffix}`, {
          headers: {
            ...createAuthHeaders()
          }
        });
        return Array.isArray(data) ? data.map(resolveProductImages) : [];
      },
      async loadAdminPayments(filters = {}) {
        const params = new URLSearchParams();
        if (filters.paymentStatus) {
          params.set("paymentStatus", filters.paymentStatus);
        }
        const suffix = params.toString() ? `?${params.toString()}` : "";
        const data = await fetchJson(`${baseUrl}/admin/payments${suffix}`, {
          headers: {
            ...createAuthHeaders()
          }
        });
        return Array.isArray(data) ? data : [];
      },
      async createReport(payload) {
        return fetchJson(`${baseUrl}/reports`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...createAuthHeaders()
          },
          body: JSON.stringify(payload)
        });
      },
      async loadAdminReports(filters = {}) {
        const params = new URLSearchParams();
        if (filters.status) {
          params.set("status", filters.status);
        }
        const suffix = params.toString() ? `?${params.toString()}` : "";
        const data = await fetchJson(`${baseUrl}/admin/reports${suffix}`, {
          headers: {
            ...createAuthHeaders()
          }
        });
        return Array.isArray(data) ? data : [];
      },
      async reviewReport(reportId, payload) {
        return fetchJson(`${baseUrl}/admin/reports/${encodeURIComponent(reportId)}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...createAuthHeaders()
          },
          body: JSON.stringify(payload)
        });
      },
      async loadAdminUserInvestigation(username, payload) {
        return fetchJson(`${baseUrl}/admin/users/${encodeURIComponent(username)}/investigation`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...createAuthHeaders()
          },
          body: JSON.stringify(payload || {})
        });
      },
      async moderateUser(username, payload) {
        return fetchJson(`${baseUrl}/admin/users/${encodeURIComponent(username)}/moderation`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...createAuthHeaders()
          },
          body: JSON.stringify(payload)
        });
      },
      async loadModerationActions() {
        const data = await fetchJson(`${baseUrl}/admin/moderation-actions`, {
          headers: {
            ...createAuthHeaders()
          }
        });
        return Array.isArray(data) ? data : [];
      },
      async logClientEvent(event) {
        try {
          await fetchJson(`${baseUrl}/client-events`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...createAuthHeaders()
            },
            body: JSON.stringify(event)
          });
        } catch (error) {
          // Ignore telemetry failures.
        }
      },
      async moderateProduct(productId, payload) {
        const result = await fetchJson(`${baseUrl}/admin/products/${encodeURIComponent(productId)}/moderate`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...createAuthHeaders()
          },
          body: JSON.stringify(payload)
        });
        return resolveProductImages(result);
      },
      async likeProduct(productId) {
        const result = await fetchJson(`${baseUrl}/products/${encodeURIComponent(productId)}/like`, {
          method: "POST",
          headers: {
            ...createAuthHeaders()
          }
        });
        return resolveProductImages(result);
      },
      async trackProductView(productId) {
        const result = await fetchJson(`${baseUrl}/products/${encodeURIComponent(productId)}/view`, {
          method: "POST",
          headers: {
            ...createAuthHeaders()
          }
        });
        return resolveProductImages(result);
      }
    };
  }

  function fireFieldToValue(field) {
    if (!field) return null;
    if (Object.prototype.hasOwnProperty.call(field, "stringValue")) return field.stringValue;
    if (Object.prototype.hasOwnProperty.call(field, "integerValue")) return Number(field.integerValue);
    if (Object.prototype.hasOwnProperty.call(field, "doubleValue")) return Number(field.doubleValue);
    if (Object.prototype.hasOwnProperty.call(field, "booleanValue")) return Boolean(field.booleanValue);
    if (field.nullValue !== undefined) return null;
    if (field.arrayValue) {
      return (field.arrayValue.values || []).map(fireFieldToValue);
    }
    if (field.mapValue) {
      const output = {};
      const fields = field.mapValue.fields || {};
      Object.keys(fields).forEach((key) => {
        output[key] = fireFieldToValue(fields[key]);
      });
      return output;
    }
    return null;
  }

  function valueToFireField(value) {
    if (value === null || value === undefined) return { nullValue: null };
    if (Array.isArray(value)) {
      return {
        arrayValue: {
          values: value.map(valueToFireField)
        }
      };
    }
    if (typeof value === "number") {
      if (Number.isInteger(value)) {
        return { integerValue: String(value) };
      }
      return { doubleValue: value };
    }
    if (typeof value === "boolean") {
      return { booleanValue: value };
    }
    if (typeof value === "object") {
      const fields = {};
      Object.keys(value).forEach((key) => {
        fields[key] = valueToFireField(value[key]);
      });
      return { mapValue: { fields } };
    }
    return { stringValue: String(value) };
  }

  function createFirebaseAdapter(config) {
    const firebaseConfig = config.firebase || {};
    const sessionAdapter = createLocalAdapter();
    const projectId = firebaseConfig.projectId;
    const apiKey = firebaseConfig.apiKey;

    if (!projectId || !apiKey) {
      throw new Error("Firebase provider needs projectId and apiKey in winga-config.js");
    }

    function documentUrl(documentPath) {
      return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${documentPath}?key=${apiKey}`;
    }

    async function loadDocument(documentPath) {
      try {
        const data = await fetchJson(documentUrl(documentPath));
        return fireFieldToValue(data.fields?.payload) || [];
      } catch (error) {
        return [];
      }
    }

    async function saveDocument(documentPath, payload) {
      await fetchJson(documentUrl(documentPath), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: {
            payload: valueToFireField(payload)
          }
        })
      });
    }

    return {
      async loadUsers() {
        return loadDocument(firebaseConfig.usersDocumentPath || "wingaState/users");
      },
      async saveUsers(users) {
        await saveDocument(firebaseConfig.usersDocumentPath || "wingaState/users", users);
      },
      async loadProducts() {
        return loadDocument(firebaseConfig.productsDocumentPath || "wingaState/products");
      },
      async loadCategories() {
        return loadDocument(firebaseConfig.categoriesDocumentPath || "wingaState/categories");
      },
      async saveCategories(categories) {
        await saveDocument(firebaseConfig.categoriesDocumentPath || "wingaState/categories", categories);
      },
      async saveProducts(products) {
        await saveDocument(firebaseConfig.productsDocumentPath || "wingaState/products", products);
      },
      loadSession() {
        return sessionAdapter.loadSession();
      },
      saveSession(session) {
        sessionAdapter.saveSession(session);
      },
      clearSession() {
        sessionAdapter.clearSession();
      },
      async logoutSession() {
        sessionAdapter.clearSession();
        return { ok: true };
      },
      async restoreSession() {
        return this.loadSession();
      },
      async signup(payload) {
        const safePayload = stripSignupCategoryFields(payload);
        const users = await this.loadUsers();
        const duplicateUsername = safePayload.role !== "buyer" && users.find((item) => item.username === safePayload.username);
        if (duplicateUsername) {
          throw new Error("Username hiyo tayari imetumika.");
        }

        const duplicatePhone = users.find((item) => item.phoneNumber === safePayload.phoneNumber);
        if (duplicatePhone) {
          throw new Error("Namba hiyo ya simu tayari imesajiliwa.");
        }

        const duplicateNationalId = users.find((item) => item.nationalId === safePayload.nationalId);
        if (duplicateNationalId) {
          throw new Error("Namba hiyo ya kitambulisho tayari imesajiliwa.");
        }

        if (safePayload.role === "buyer" && users.find((item) => normalizeIdentifier(item.fullName) === normalizeIdentifier(safePayload.fullName))) {
          throw new Error("Jina hilo tayari limetumika.");
        }

        const nextUser = {
          ...safePayload,
          username: safePayload.role === "buyer" ? `buyer-${Date.now()}` : safePayload.username,
          fullName: safePayload.fullName || safePayload.username,
          role: safePayload.role || "seller",
          primaryCategory: "",
          nationalId: normalizeNationalId(safePayload.nationalId),
          phoneNumber: normalizePhoneNumber(safePayload.phoneNumber),
          whatsappNumber: normalizePhoneNumber(safePayload.phoneNumber),
          whatsappVerificationStatus: "verified",
          whatsappVerifiedAt: new Date().toISOString(),
          password: await hashLocalPassword(safePayload.password),
          status: "active",
          verifiedSeller: safePayload.role === "seller",
          verificationStatus: safePayload.role === "seller" ? "verified" : "",
          verificationSubmittedAt: safePayload.role === "seller" ? new Date().toISOString() : "",
          createdAt: safePayload.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        users.push(nextUser);
        await this.saveUsers(users);
        return {
          username: nextUser.username,
          fullName: nextUser.fullName,
          primaryCategory: "",
          role: nextUser.role,
          phoneNumber: nextUser.phoneNumber,
          whatsappNumber: nextUser.whatsappNumber,
          whatsappVerificationStatus: nextUser.whatsappVerificationStatus,
          whatsappVerifiedAt: nextUser.whatsappVerifiedAt,
          profileImage: nextUser.profileImage || "",
          verificationStatus: nextUser.verificationStatus || "",
          verifiedSeller: Boolean(nextUser.verifiedSeller),
          token: null
        };
      },
      async login(payload) {
        const users = await this.loadUsers();
        const identifier = normalizeIdentifier(payload.identifier || payload.username);
        const phone = normalizePhoneNumber(identifier);
        const userIndex = users.findIndex((item) =>
          (normalizeIdentifier(item.username) === identifier
          || normalizeIdentifier(item.fullName) === identifier
          || normalizePhoneNumber(item.phoneNumber) === phone)
        );
        const user = userIndex >= 0 ? users[userIndex] : null;
        const passwordMatches = user ? await verifyLocalPassword(payload.password, user.password) : false;
        if (!user || !passwordMatches) {
          throw new Error("Taarifa za login si sahihi. Hakikisha username na password ni sahihi.");
        }
        if (user.status === "suspended" || user.status === "banned") {
          throw new Error(getBlockedAccountMessage(user.status));
        }
        if (isStaffRole(user.role)) {
          throw new Error("Admin au moderator wanapaswa kutumia admin login route ya Winga.");
        }
        if (!isLocalPasswordHashed(user.password)) {
          users[userIndex] = {
            ...user,
            password: await hashLocalPassword(payload.password),
            updatedAt: new Date().toISOString()
          };
          await this.saveUsers(users);
        }
        return buildSessionPayload(user);
      },
      async recoverPassword(payload) {
        const users = await this.loadUsers();
        const identifier = normalizeIdentifier(payload?.identifier || payload?.username);
        const identifierPhone = normalizePhoneNumber(payload?.identifier || payload?.username || "");
        const phone = normalizePhoneNumber(payload?.phoneNumber || "");
        const nationalId = normalizeNationalId(payload?.nationalId || "");
        const nextPassword = String(payload?.newPassword || payload?.password || "");
        const userIndex = users.findIndex((item) =>
          normalizeIdentifier(item.username) === identifier
          || normalizeIdentifier(item.fullName) === identifier
          || normalizePhoneNumber(item.phoneNumber) === identifierPhone
        );
        const user = userIndex >= 0 ? users[userIndex] : null;
        const phoneMatches = user && (
          normalizePhoneNumber(user.phoneNumber) === phone
          || normalizePhoneNumber(user.whatsappNumber) === phone
        );
        const idMatches = user && normalizeNationalId(user.nationalId || user.identityDocumentNumber) === nationalId;
        if (!user || isStaffRole(user.role) || !phoneMatches || !idMatches) {
          throw new Error("Taarifa za kurejesha password hazijalingana na akaunti hii.");
        }
        if (nextPassword.length < 6) {
          throw new Error("Password mpya inapaswa kuwa na angalau herufi 6.");
        }
        users[userIndex] = {
          ...user,
          password: await hashLocalPassword(nextPassword),
          updatedAt: new Date().toISOString()
        };
        await this.saveUsers(users);
        this.clearSession();
        return { ok: true };
      },
      async adminLogin(payload) {
        const users = await this.loadUsers();
        const identifier = normalizeIdentifier(payload.identifier || payload.username);
        const phone = normalizePhoneNumber(identifier);
        const userIndex = users.findIndex((item) =>
          (normalizeIdentifier(item.username) === identifier
          || normalizeIdentifier(item.fullName) === identifier
          || normalizePhoneNumber(item.phoneNumber) === phone)
        );
        const user = userIndex >= 0 ? users[userIndex] : null;
        const passwordMatches = user ? await verifyLocalPassword(payload.password, user.password) : false;
        if (!user || !passwordMatches || !isStaffRole(user.role)) {
          throw new Error("Taarifa za admin login si sahihi.");
        }
        if (user.status === "suspended" || user.status === "banned") {
          throw new Error(getBlockedAccountMessage(user.status));
        }
        if (!isLocalPasswordHashed(user.password)) {
          users[userIndex] = {
            ...user,
            password: await hashLocalPassword(payload.password),
            updatedAt: new Date().toISOString()
          };
          await this.saveUsers(users);
        }
        return buildSessionPayload(user);
      },
      async updateUserProfile(payload) {
        const session = this.loadSession();
        if (!session?.username) {
          throw new Error("Ingia kwanza kabla ya kubadilisha profile.");
        }
        const users = await this.loadUsers();
        let updatedUser = null;
        const nextUsers = users.map((item) => {
          if (item.username !== session.username) {
            return item;
          }
          updatedUser = {
            ...item,
            profileImage: payload?.profileImage || "",
            updatedAt: new Date().toISOString()
          };
          return updatedUser;
        });
        if (!updatedUser) {
          throw new Error("Akaunti yako haikupatikana tena. Ingia upya kabla ya kujaribu tena.");
        }
        await this.saveUsers(nextUsers);
        return {
          username: updatedUser.username,
          fullName: updatedUser.fullName || updatedUser.username,
          primaryCategory: updatedUser.primaryCategory || "",
          role: updatedUser.role || "seller",
          phoneNumber: updatedUser.phoneNumber || "",
          whatsappNumber: updatedUser.whatsappNumber || updatedUser.phoneNumber || "",
          whatsappVerificationStatus: updatedUser.whatsappVerificationStatus || "verified",
          whatsappVerifiedAt: updatedUser.whatsappVerifiedAt || "",
          pendingWhatsappNumber: updatedUser.pendingWhatsappNumber || "",
          pendingWhatsappExpiresAt: updatedUser.pendingWhatsappExpiresAt || "",
          profileImage: updatedUser.profileImage || "",
          verificationStatus: updatedUser.verificationStatus || "",
          token: session.token || null
        };
      },
      async updateUserPrimaryCategory(username, primaryCategory) {
        const normalizedCategory = normalizePrimaryCategoryValue(primaryCategory);
        const users = await this.loadUsers();
        const nextUsers = users.map((item) =>
          item.username === username ? { ...item, primaryCategory: normalizedCategory } : item
        );
        await this.saveUsers(nextUsers);
      },
      async addCategory(category) {
        const categories = await this.loadCategories();
        if (!categories.find((item) => item.value === category.value)) {
          categories.push(category);
          await this.saveCategories(categories);
        }
        return category;
      },
      async createProduct(product) {
        const session = this.loadSession();
        const users = await this.loadUsers();
        const owner = users.find((item) => item.username === session?.username);
        const whatsapp = getPreferredWhatsappNumber(owner || session || {});
        const products = await this.loadProducts();
        const nextProducts = [{ ...product, whatsapp }, ...products];
        await this.saveProducts(nextProducts);
        return nextProducts[0];
      },
      async updateProduct(productId, payload) {
        const session = this.loadSession();
        const users = await this.loadUsers();
        const owner = users.find((item) => item.username === session?.username);
        const whatsapp = getPreferredWhatsappNumber(owner || session || {});
        const products = await this.loadProducts();
        let updatedProduct = null;
        const nextProducts = products.map((item) => {
          if (item.id !== productId) {
            return item;
          }
          updatedProduct = { ...item, ...payload, whatsapp, id: item.id, uploadedBy: item.uploadedBy };
          return updatedProduct;
        });
        await this.saveProducts(nextProducts);
        return updatedProduct;
      },
      async requestWhatsappChange(payload) {
        const session = this.loadSession();
        if (!session?.username) {
          throw new Error("Ingia kwanza kabla ya kubadilisha WhatsApp number.");
        }
        const nextWhatsappNumber = normalizePhoneNumber(payload?.whatsappNumber || "");
        if (!/^\d{10,15}$/.test(nextWhatsappNumber)) {
          throw new Error("Weka namba mpya ya WhatsApp sahihi.");
        }
        const users = await this.loadUsers();
        const currentUser = users.find((item) => item.username === session.username);
        if (!currentUser) {
          throw new Error("Akaunti yako haikupatikana tena. Ingia upya kabla ya kujaribu tena.");
        }
        const activeWhatsappNumber = getPreferredWhatsappNumber(currentUser);
        if (nextWhatsappNumber === activeWhatsappNumber) {
          throw new Error("Namba hiyo tayari ndiyo WhatsApp number ya account yako.");
        }
        const conflictingUser = users.find((item) =>
          item.username !== session.username
          && (
            normalizePhoneNumber(item.phoneNumber || "") === nextWhatsappNumber
            || normalizePhoneNumber(item.whatsappNumber || "") === nextWhatsappNumber
            || normalizePhoneNumber(item.pendingWhatsappNumber || "") === nextWhatsappNumber
          )
        );
        if (conflictingUser) {
          throw new Error("Namba hiyo tayari inatumika kwenye account nyingine.");
        }
        const previewCode = generateVerificationCode();
        const expiresAt = new Date(Date.now() + (10 * 60 * 1000)).toISOString();
        const nextUsers = users.map((item) =>
          item.username === session.username
            ? {
                ...item,
                pendingWhatsappNumber: nextWhatsappNumber,
                pendingWhatsappCode: previewCode,
                pendingWhatsappExpiresAt: expiresAt,
                whatsappVerificationStatus: "pending",
                updatedAt: new Date().toISOString()
              }
            : item
        );
        await this.saveUsers(nextUsers);
        return {
          ok: true,
          pendingWhatsappNumber: nextWhatsappNumber,
          expiresAt,
          deliveryMode: "preview",
          previewCode
        };
      },
      async verifyWhatsappChange(payload) {
        const session = this.loadSession();
        if (!session?.username) {
          throw new Error("Ingia kwanza kabla ya kuthibitisha WhatsApp number.");
        }
        const code = String(payload?.code || "").trim();
        if (!/^\d{6}$/.test(code)) {
          throw new Error("Weka verification code ya tarakimu 6.");
        }
        const users = await this.loadUsers();
        const currentUser = users.find((item) => item.username === session.username);
        if (!currentUser) {
          throw new Error("Akaunti yako haikupatikana tena. Ingia upya kabla ya kujaribu tena.");
        }
        if (!currentUser.pendingWhatsappNumber || !currentUser.pendingWhatsappCode || !currentUser.pendingWhatsappExpiresAt) {
          throw new Error("Hakuna mabadiliko ya WhatsApp yanayosubiri verification.");
        }
        if (new Date(currentUser.pendingWhatsappExpiresAt).getTime() < Date.now()) {
          throw new Error("Verification code imeexpire. Omba code mpya ya WhatsApp.");
        }
        if (currentUser.pendingWhatsappCode !== code) {
          throw new Error("Verification code ya WhatsApp si sahihi.");
        }
        const now = new Date().toISOString();
        const verifiedWhatsappNumber = normalizePhoneNumber(currentUser.pendingWhatsappNumber);
        const nextUsers = users.map((item) =>
          item.username === session.username
            ? {
                ...item,
                whatsappNumber: verifiedWhatsappNumber,
                whatsappVerificationStatus: "verified",
                whatsappVerifiedAt: now,
                pendingWhatsappNumber: "",
                pendingWhatsappCode: "",
                pendingWhatsappExpiresAt: "",
                updatedAt: now
              }
            : item
        );
        await this.saveUsers(nextUsers);
        const products = await this.loadProducts();
        const nextProducts = products.map((item) =>
          item.uploadedBy === session.username
            ? { ...item, whatsapp: verifiedWhatsappNumber }
            : item
        );
        await this.saveProducts(nextProducts);
        return buildSessionPayload({
          ...currentUser,
          whatsappNumber: verifiedWhatsappNumber,
          whatsappVerificationStatus: "verified",
          whatsappVerifiedAt: now,
          pendingWhatsappNumber: "",
          pendingWhatsappExpiresAt: ""
        }, session.token || null);
      },
      async deleteProduct(productId) {
        const products = await this.loadProducts();
        const nextProducts = products.filter((item) => item.id !== productId);
        await this.saveProducts(nextProducts);
      },
        async loadAnalytics() {
          return null;
        },
        async loadMessages() {
          const session = this.loadSession();
          const messages = await loadDocument(firebaseConfig.messagesDocumentPath || "wingaState/messages");
          if (!session?.username) {
            return [];
          }
          return messages.filter((item) => item.senderId === session.username || item.receiverId === session.username);
        },
        async sendMessage(payload) {
          const session = this.loadSession();
          if (!session?.username) {
            throw new Error("Ingia kwanza kabla ya kutuma ujumbe.");
          }
          const messages = await loadDocument(firebaseConfig.messagesDocumentPath || "wingaState/messages");
          const normalizedMessage = String(payload.message || "").trim();
          const duplicateWindowMs = 8000;
          const recentDuplicate = messages.find((item) =>
            item.senderId === session.username
            && item.receiverId === payload.receiverId
            && (item.productId || "") === (payload.productId || "")
            && String(item.message || "").trim() === normalizedMessage
            && (Date.now() - new Date(item.createdAt || item.timestamp || 0).getTime()) < duplicateWindowMs
          );
          if (recentDuplicate) {
            throw new Error("Subiri kidogo kabla ya kutuma ujumbe ule ule tena.");
          }
          const nextMessage = {
            id: `msg-${Date.now()}`,
            senderId: session.username,
            receiverId: payload.receiverId,
            messageType: payload.messageType || (Array.isArray(payload.productItems) && payload.productItems.length > 1 ? "product_inquiry" : Array.isArray(payload.productItems) && payload.productItems.length === 1 ? "product_reference" : "text"),
            productId: payload.productId || "",
            productName: payload.productName || "",
            productItems: Array.isArray(payload.productItems) ? payload.productItems : [],
            replyToMessageId: payload.replyToMessageId || "",
            message: payload.message || "",
            timestamp: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deliveredAt: new Date().toISOString(),
            readAt: "",
            isDelivered: true,
            isRead: false
          };
          await saveDocument(firebaseConfig.messagesDocumentPath || "wingaState/messages", [nextMessage, ...messages]);
          return nextMessage;
        },
        async deleteMessage(messageId) {
          const session = this.loadSession();
          const messages = await loadDocument(firebaseConfig.messagesDocumentPath || "wingaState/messages");
          const targetMessage = messages.find((item) => item.id === messageId);
          if (!targetMessage || targetMessage.senderId !== session?.username) {
            throw new Error("Huwezi kufuta ujumbe huu.");
          }
          await saveDocument(firebaseConfig.messagesDocumentPath || "wingaState/messages", messages.filter((item) => item.id !== messageId));
          return { ok: true };
        },
        async loadReviews() {
          const reviews = await loadDocument(firebaseConfig.reviewsDocumentPath || "wingaState/reviews");
          const summaryMap = new Map();
          reviews.forEach((review) => {
            const key = review.productId;
            if (!summaryMap.has(key)) {
              summaryMap.set(key, []);
            }
            summaryMap.get(key).push(review);
          });
          return {
            reviews,
            summaries: Array.from(summaryMap.entries()).reduce((accumulator, [productId, items]) => {
              const totalReviews = items.length;
              const averageRating = totalReviews
                ? Number((items.reduce((sum, item) => sum + Number(item.rating || 0), 0) / totalReviews).toFixed(1))
                : 0;
              accumulator[productId] = { averageRating, totalReviews };
              return accumulator;
            }, {})
          };
        },
        async createReview(payload) {
          const session = this.loadSession();
          if (!session?.username) {
            throw new Error("Ingia kwanza kabla ya ku-review.");
          }
          if (!Number.isInteger(Number(payload?.rating)) || Number(payload.rating) < 1 || Number(payload.rating) > 5) {
            throw new Error("Rating inapaswa kuwa kati ya 1 na 5.");
          }
          if (!String(payload?.comment || "").trim() || String(payload.comment || "").trim().length < 3) {
            throw new Error("Review lazima iwe na maoni mafupi yenye maana.");
          }
          const reviews = await loadDocument(firebaseConfig.reviewsDocumentPath || "wingaState/reviews");
          const duplicate = reviews.find((item) => item.productId === payload.productId && item.userId === session.username);
          if (duplicate) {
            throw new Error("Tayari ume-review bidhaa hii.");
          }
          const nextReview = {
            id: `review-${Date.now()}`,
            userId: session.username,
            productId: payload.productId,
            sellerId: payload.sellerId || "",
            rating: Number(payload.rating),
            comment: payload.comment,
            verifiedBuyer: true,
            date: new Date().toISOString()
          };
          await saveDocument(firebaseConfig.reviewsDocumentPath || "wingaState/reviews", [nextReview, ...reviews]);
          return nextReview;
        },
        async loadMyOrders() {
          return { purchases: [], sales: [] };
        },
      async createOrder() {
        throw new Error("Order flow inapatikana kwenye API mode tu.");
      },
      async updateOrderStatus() {
        throw new Error("Order flow inapatikana kwenye API mode tu.");
      },
      async updateProductAvailability() {
        throw new Error("Order flow inapatikana kwenye API mode tu.");
      },
      async loadAdminUsers() {
        return [];
      },
      async loadAdminProducts() {
        return [];
      },
      async loadAdminOrders() {
        return [];
      },
      async loadAdminPayments() {
        return [];
      },
      async createReport() {
        throw new Error("Reporting inapatikana kwenye API mode tu.");
      },
      async loadAdminReports() {
        return [];
      },
      async reviewReport() {
        throw new Error("Report review inapatikana kwenye API mode tu.");
      },
      async loadAdminUserInvestigation() {
        throw new Error("Fraud review inapatikana kwenye API mode tu.");
      },
      async moderateUser() {
        throw new Error("User moderation inapatikana kwenye API mode tu.");
      },
      async loadModerationActions() {
        return [];
      },
      async logClientEvent() {
        return null;
      },
      async moderateProduct() {
        throw new Error("Moderation inapatikana kwenye API mode tu.");
      },
      async likeProduct(productId) {
        const products = await this.loadProducts();
        const nextProducts = products.map((item) =>
          item.id === productId ? { ...item, likes: Number(item.likes || 0) + 1 } : item
        );
        await this.saveProducts(nextProducts);
      },
      async trackProductView(productId) {
        const session = this.loadSession();
        const products = await this.loadProducts();
        const nextProducts = products.map((item) => {
          if (item.id !== productId) {
            return item;
          }
          const viewedBy = Array.isArray(item.viewedBy) ? item.viewedBy : [];
          if (!session?.username || viewedBy.includes(session.username)) {
            return item;
          }
          return {
            ...item,
            views: Number(item.views || 0) + 1,
            viewedBy: [...viewedBy, session.username]
          };
        });
        await this.saveProducts(nextProducts);
      }
    };
  }

  function chooseAdapter(config) {
    const provider = config.provider || "local";
    if (provider === "mock") return createMockAdapter();
    if (provider === "api") return createApiAdapter(config);
    if (provider === "firebase") return createFirebaseAdapter(config);
    return createLocalAdapter();
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function isRetryableBootError(error) {
    const message = String(error?.message || "").toLowerCase();
    return Boolean(
      error?.name === "TypeError"
      || message.includes("fetch")
      || message.includes("network")
      || message.includes("request took too long")
      || message.includes("failed to fetch")
      || message.includes("attempting to fetch resource")
    );
  }

  async function withRetry(task, options = {}) {
    const {
      retries = 0,
      delayMs = 800,
      shouldRetry = () => false
    } = options;

    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        return await task(attempt);
      } catch (error) {
        lastError = error;
        if (attempt >= retries || !shouldRetry(error, attempt)) {
          throw error;
        }
        await wait(delayMs * (attempt + 1));
      }
    }
    throw lastError;
  }

  const state = {
    users: [],
    products: [],
    categories: [],
    initialized: false,
    productsHydrated: false,
    startupHydrationStarted: false,
    adapter: null,
    activeProvider: ""
  };

  function getCurrentSessionRole() {
    const session = state.adapter?.loadSession ? state.adapter.loadSession() : null;
    return session?.role || "";
  }

  function assertBuyerCapableAccess() {
    if (!isBuyerCapableRole(getCurrentSessionRole())) {
      throw new Error("Action hii inahitaji buyer au seller account.");
    }
  }

  function assertSellerAccess() {
    if (getCurrentSessionRole() !== "seller") {
      throw new Error("Action hii inahitaji seller account.");
    }
  }

  function assertAdminAccess() {
    if (getCurrentSessionRole() !== "admin") {
      throw new Error("Action hii inaruhusiwa kwa admin tu.");
    }
  }

  function assertModerationAccess() {
    if (!isStaffRole(getCurrentSessionRole())) {
      throw new Error("Action hii inaruhusiwa kwa admin au moderator tu.");
    }
  }

  function ensureAdapter() {
    if (!state.adapter) {
      const config = window.WINGA_CONFIG || {};
      state.activeProvider = config.provider || "local";
      state.adapter = chooseAdapter(config);
    }
    return state.adapter;
  }

  async function loadInitialState(adapter) {
    state.productsHydrated = false;
    Promise.resolve()
      .then(() => adapter.loadProducts())
      .then((products) => {
        state.products = Array.isArray(products) ? products : [];
        state.productsHydrated = true;
        if (typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof window.CustomEvent === "function") {
          window.dispatchEvent(new window.CustomEvent("winga:products-hydrated", {
            detail: {
              status: "loaded",
              count: state.products.length
            }
          }));
        }
        return state.products;
      })
      .catch((error) => {
        console.warn("[WINGA] Product startup load failed.", error);
        state.productsHydrated = true;
        if (typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof window.CustomEvent === "function") {
          window.dispatchEvent(new window.CustomEvent("winga:products-hydrated", {
            detail: {
              status: "failed",
              count: state.products.length,
              error: String(error?.message || error || "")
            }
          }));
        }
        return state.products;
      });

    Promise.resolve()
      .then(() => adapter.loadUsers())
      .then((users) => {
        state.users = Array.isArray(users) ? users : [];
        if (typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof window.CustomEvent === "function") {
          window.dispatchEvent(new window.CustomEvent("winga:data-hydrated", {
            detail: {
              source: "users",
              count: state.users.length
            }
          }));
        }
        return state.users;
      })
      .catch((error) => {
        console.warn("[WINGA] Optional startup load failed for users.", error);
        return state.users;
      });

    Promise.resolve()
      .then(() => (adapter.loadCategories ? adapter.loadCategories() : Promise.resolve([])))
      .then((categories) => {
        state.categories = Array.isArray(categories) ? categories : [];
        if (typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof window.CustomEvent === "function") {
          window.dispatchEvent(new window.CustomEvent("winga:data-hydrated", {
            detail: {
              source: "categories",
              count: state.categories.length
            }
          }));
        }
        return state.categories;
      })
      .catch((error) => {
        console.warn("[WINGA] Optional startup load failed for categories.", error);
        return state.categories;
      });
  }

  window.WingaDataLayer = {
    async init() {
      if (state.initialized) return;
      ensureAdapter();
      state.initialized = true;
    },
    async hydrateStartupData() {
      if (state.startupHydrationStarted) {
        return;
      }
      state.startupHydrationStarted = true;
      const config = window.WINGA_CONFIG || {};
      ensureAdapter();

      try {
        await withRetry(
          () => loadInitialState(state.adapter),
          {
            retries: state.activeProvider === "api" ? 2 : 0,
            delayMs: 1200,
            shouldRetry: (error) => state.activeProvider === "api" && isRetryableBootError(error)
          }
        );
        if (state.activeProvider === "api") {
          clearLegacyLocalFallbackArtifacts();
        }
      } catch (error) {
        const fallbackProvider = typeof config.fallbackProvider === "string"
          ? config.fallbackProvider.trim()
          : (config.fallbackProvider || "local");
        const canFallback = fallbackProvider && fallbackProvider !== state.activeProvider;
        if (!canFallback) {
          console.warn("[WINGA] Startup hydration failed.", error);
          return;
        }

        console.warn(`[WINGA] Provider "${state.activeProvider}" failed during startup hydration. Falling back to "${fallbackProvider}".`, error);
        state.activeProvider = fallbackProvider;
        state.adapter = chooseAdapter({
          ...config,
          provider: fallbackProvider
        });
        try {
          await loadInitialState(state.adapter);
        } catch (fallbackError) {
          console.warn("[WINGA] Fallback startup hydration failed.", fallbackError);
        }
      }
    },
    bootstrapSession() {
      return ensureAdapter().loadSession();
    },
    getUsers() {
      return clone(state.users);
    },
    async saveUsers(users) {
      const nextUsers = clone(users);
      await state.adapter.saveUsers(nextUsers);
      state.users = nextUsers;
    },
    getProducts() {
      return clone(state.products);
    },
    getActiveProvider() {
      ensureAdapter();
      return state.activeProvider || "";
    },
    getCategories() {
      return clone(state.categories);
    },
    isProductsHydrated() {
      return Boolean(state.productsHydrated);
    },
    cleanupLocalFallbackArtifacts() {
      clearLegacyLocalFallbackArtifacts();
    },
    async saveProducts(products) {
      const nextProducts = clone(products);
      await state.adapter.saveProducts(nextProducts);
      state.products = nextProducts;
    },
    async signup(payload) {
      const result = await state.adapter.signup(stripSignupCategoryFields(payload));
      state.users = await state.adapter.loadUsers();
      return result;
    },
    async login(payload) {
      return state.adapter.login(payload);
    },
    async recoverPassword(payload) {
      return state.adapter.recoverPassword(payload);
    },
    async adminLogin(payload) {
      return state.adapter.adminLogin ? state.adapter.adminLogin(payload) : state.adapter.login(payload);
    },
    async updateUserProfile(payload) {
      const result = await (state.adapter.updateUserProfile ? state.adapter.updateUserProfile(payload) : null);
      if (!result?.username) {
        throw new Error("Profile update haikufaulu. Ingia upya kisha ujaribu tena.");
      }
      state.users = await state.adapter.loadUsers();
      return result;
    },
    async upgradeBuyerToSeller(payload) {
      const result = await (state.adapter.upgradeBuyerToSeller ? state.adapter.upgradeBuyerToSeller(payload) : null);
      if (!result?.username) {
        throw new Error("Seller upgrade haikufaulu. Ingia upya kisha ujaribu tena.");
      }
      state.users = await state.adapter.loadUsers();
      return result;
    },
    async refreshUsers() {
      state.users = await state.adapter.loadUsers();
      return clone(state.users);
    },
    async requestWhatsappChange(payload) {
      const result = await (state.adapter.requestWhatsappChange ? state.adapter.requestWhatsappChange(payload) : null);
      state.users = await state.adapter.loadUsers();
      return result;
    },
    async verifyWhatsappChange(payload) {
      const result = await (state.adapter.verifyWhatsappChange ? state.adapter.verifyWhatsappChange(payload) : null);
      if (!result?.username) {
        throw new Error("WhatsApp verification haikufaulu. Jaribu tena.");
      }
      state.users = await state.adapter.loadUsers();
      return result;
    },
    async updateUserPrimaryCategory(username, primaryCategory) {
      assertSellerAccess();
      const normalizedCategory = normalizePrimaryCategoryValue(primaryCategory);
      if (!normalizedCategory) {
        state.users = await state.adapter.loadUsers();
        return;
      }
      await state.adapter.updateUserPrimaryCategory(username, normalizedCategory);
      state.users = await state.adapter.loadUsers();
    },
    async addCategory(category) {
      assertSellerAccess();
      const result = await state.adapter.addCategory(category);
      state.categories = state.adapter.loadCategories ? await state.adapter.loadCategories() : state.categories;
      return result;
    },
    async createProduct(product) {
      assertSellerAccess();
      const result = await state.adapter.createProduct(product);
      state.products = await state.adapter.loadProducts();
      return result;
    },
    async updateProduct(productId, payload) {
      assertSellerAccess();
      const result = await state.adapter.updateProduct(productId, payload);
      state.products = await state.adapter.loadProducts();
      return result;
    },
    async deleteProduct(productId) {
      assertSellerAccess();
      const result = await state.adapter.deleteProduct(productId);
      state.products = await state.adapter.loadProducts();
      return result;
    },
      async loadAnalytics() {
        return state.adapter.loadAnalytics ? state.adapter.loadAnalytics() : null;
      },
      async loadMessages() {
        assertBuyerCapableAccess();
        return state.adapter.loadMessages ? state.adapter.loadMessages() : [];
      },
      async sendMessage(payload) {
        assertBuyerCapableAccess();
        return state.adapter.sendMessage ? state.adapter.sendMessage(payload) : null;
      },
      async deleteMessage(messageId) {
        assertBuyerCapableAccess();
        return state.adapter.deleteMessage ? state.adapter.deleteMessage(messageId) : { ok: true };
      },
      async markConversationRead(payload) {
        assertBuyerCapableAccess();
        return state.adapter.markConversationRead ? state.adapter.markConversationRead(payload) : { ok: true };
      },
      async loadNotifications() {
        assertBuyerCapableAccess();
        return state.adapter.loadNotifications ? state.adapter.loadNotifications() : [];
      },
      async markNotificationRead(notificationId) {
        assertBuyerCapableAccess();
        return state.adapter.markNotificationRead ? state.adapter.markNotificationRead(notificationId) : { ok: true };
      },
      async loadPromotions() {
        return state.adapter.loadPromotions ? state.adapter.loadPromotions() : [];
      },
      async createPromotion(payload) {
        assertSellerAccess();
        return state.adapter.createPromotion ? state.adapter.createPromotion(payload) : null;
      },
      async loadAdminPromotions() {
        assertAdminAccess();
        return state.adapter.loadAdminPromotions ? state.adapter.loadAdminPromotions() : [];
      },
      async loadAdminOpsSummary() {
        assertAdminAccess();
        return state.adapter.loadAdminOpsSummary ? state.adapter.loadAdminOpsSummary() : null;
      },
      async disablePromotion(promotionId) {
        assertAdminAccess();
        return state.adapter.disablePromotion ? state.adapter.disablePromotion(promotionId) : { ok: true };
      },
      openRealtimeChannel(handlers = {}) {
        return state.adapter.openRealtimeChannel ? state.adapter.openRealtimeChannel(handlers) : null;
      },
      async loadReviews(productId) {
        return state.adapter.loadReviews ? state.adapter.loadReviews(productId) : { reviews: [], summaries: {} };
      },
      async createReview(payload) {
        assertBuyerCapableAccess();
        return state.adapter.createReview ? state.adapter.createReview(payload) : null;
      },
      async loadMyOrders() {
        assertBuyerCapableAccess();
        return state.adapter.loadMyOrders ? state.adapter.loadMyOrders() : { purchases: [], sales: [] };
      },
    async createOrder(payload) {
      assertBuyerCapableAccess();
      return state.adapter.createOrder ? state.adapter.createOrder(payload) : null;
    },
    async updateOrderStatus(orderId, payload) {
      assertBuyerCapableAccess();
      return state.adapter.updateOrderStatus ? state.adapter.updateOrderStatus(orderId, payload) : null;
    },
    async updateProductAvailability(productId, payload) {
      assertSellerAccess();
      return state.adapter.updateProductAvailability ? state.adapter.updateProductAvailability(productId, payload) : null;
    },
    async loadAdminUsers() {
      assertModerationAccess();
      return state.adapter.loadAdminUsers ? state.adapter.loadAdminUsers() : [];
    },
    async loadAdminProducts(status) {
      assertModerationAccess();
      return state.adapter.loadAdminProducts ? state.adapter.loadAdminProducts(status) : [];
    },
    async loadAdminOrders(filters) {
      assertAdminAccess();
      return state.adapter.loadAdminOrders ? state.adapter.loadAdminOrders(filters) : [];
    },
    async loadAdminPayments(filters) {
      assertAdminAccess();
      return state.adapter.loadAdminPayments ? state.adapter.loadAdminPayments(filters) : [];
    },
    async createReport(payload) {
      assertBuyerCapableAccess();
      return state.adapter.createReport ? state.adapter.createReport(payload) : null;
    },
    async loadAdminReports(filters) {
      assertModerationAccess();
      return state.adapter.loadAdminReports ? state.adapter.loadAdminReports(filters) : [];
    },
    async reviewReport(reportId, payload) {
      assertModerationAccess();
      return state.adapter.reviewReport ? state.adapter.reviewReport(reportId, payload) : null;
    },
    async loadAdminUserInvestigation(username, payload) {
      assertAdminAccess();
      return state.adapter.loadAdminUserInvestigation ? state.adapter.loadAdminUserInvestigation(username, payload) : null;
    },
    async moderateUser(username, payload) {
      assertModerationAccess();
      const result = await (state.adapter.moderateUser ? state.adapter.moderateUser(username, payload) : null);
      state.users = await state.adapter.loadUsers();
      state.products = await state.adapter.loadProducts();
      return result;
    },
    async loadModerationActions() {
      assertAdminAccess();
      return state.adapter.loadModerationActions ? state.adapter.loadModerationActions() : [];
    },
    async logClientEvent(event) {
      return state.adapter.logClientEvent ? state.adapter.logClientEvent(event) : null;
    },
    async moderateProduct(productId, payload) {
      assertModerationAccess();
      const result = await state.adapter.moderateProduct(productId, payload);
      state.products = await state.adapter.loadProducts();
      return result;
    },
    async likeProduct(productId) {
      const result = await state.adapter.likeProduct(productId);
      state.products = await state.adapter.loadProducts();
      return result;
    },
    async trackProductView(productId) {
      const result = await state.adapter.trackProductView(productId);
      state.products = await state.adapter.loadProducts();
      return result;
    },
    async restoreSession() {
      return state.adapter.restoreSession();
    },
    async logoutSession(tokenOverride = "") {
      return state.adapter.logoutSession
        ? state.adapter.logoutSession(tokenOverride)
        : { ok: true };
    },
    getSessionUser() {
      return state.adapter.loadSession();
    },
    saveSessionUser(session) {
      state.adapter.saveSession(session);
    },
    clearSessionUser() {
      state.adapter.clearSession();
    }
  };
})();
