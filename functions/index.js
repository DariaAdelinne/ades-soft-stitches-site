"use strict";

const Busboy = require("busboy");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const {onRequest} = require("firebase-functions/v2/https");
const {defineSecret, defineString} = require("firebase-functions/params");

const gmailAppPassword = defineSecret("GMAIL_APP_PASSWORD_FINAL");
const reviewAdminToken = defineSecret("REVIEW_ADMIN_TOKEN");
const productAdminToken = defineSecret("PRODUCT_ADMIN_TOKEN");
const cloudinaryCloudName = defineSecret("CLOUDINARY_CLOUD_NAME");
const cloudinaryApiKey = defineSecret("CLOUDINARY_API_KEY");
const cloudinaryApiSecret = defineSecret("CLOUDINARY_API_SECRET");
const gmailUser = defineString("GMAIL_USER", {default: "ades.soft.stitches@gmail.com"});
const emailSenderName = defineString("EMAIL_SENDER_NAME", {default: "Ade’s Soft Stitches"});
const catalogDatabaseUrl = defineString("CATALOG_DATABASE_URL", {
  default: "https://ades-soft-stitches-default-rtdb.europe-west1.firebasedatabase.app",
});
const DEFAULT_OWNER_EMAIL = "ades.soft.stitches@gmail.com";
const MAX_FILES = 5;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_TOTAL_FILE_SIZE = 12 * 1024 * 1024;
const MAX_REVIEW_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_REVIEW_MESSAGE_LENGTH = 350;
const CLOUDINARY_REVIEW_FOLDER = "ades-soft-stitches/reviews";
const CLOUDINARY_PRODUCT_FOLDER = "ades-soft-stitches/products";
const REVIEW_STATUSES = new Set(["pending", "approved", "rejected"]);
const REVIEW_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const PRODUCT_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const ALLOWED_ORIGINS = new Set([
  "https://adessoftstitches.vercel.app",
  "https://ades-soft-stitches-site.vercel.app",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:8888",
  "http://127.0.0.1:8888",
]);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
const requestHistory = new Map();

admin.initializeApp();

function setCors(req, res) {
  const origin = req.get("origin");
  if (origin && (ALLOWED_ORIGINS.has(origin) || /^https:\/\/[a-z0-9-]+-dariaadelinne\.vercel\.app$/i.test(origin))) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
  }
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
}

function escapeHtml(value) {
  return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\"", "&quot;")
      .replaceAll("'", "&#039;");
}

function cleanText(value, maxLength) {
  return String(value || "").replace(/\0/g, "").trim().slice(0, maxLength);
}

function isRateLimited(ip) {
  const now = Date.now();
  const interval = 15 * 60 * 1000;
  const recent = (requestHistory.get(ip) || []).filter((time) => now - time < interval);
  recent.push(now);
  requestHistory.set(ip, recent);
  return recent.length > 5;
}

function isLocalOrigin(origin) {
  return origin === "http://localhost:8080" || origin === "http://127.0.0.1:8080";
}

function isReviewRateLimited(ip, origin) {
  const now = Date.now();
  const interval = 60 * 60 * 1000;
  const limit = isLocalOrigin(origin) ? 20 : 3;
  const key = `review:${ip}`;
  const recent = (requestHistory.get(key) || []).filter((time) => now - time < interval);
  recent.push(now);
  requestHistory.set(key, recent);
  return recent.length > limit;
}

function isLikeRateLimited(ip) {
  const now = Date.now();
  const interval = 60 * 60 * 1000;
  const key = `like:${ip}`;
  const recent = (requestHistory.get(key) || []).filter((time) => now - time < interval);
  recent.push(now);
  requestHistory.set(key, recent);
  return recent.length > 30;
}

function isReviewUploadRateLimited(ip, origin) {
  const now = Date.now();
  const interval = 60 * 60 * 1000;
  const limit = isLocalOrigin(origin) ? 20 : 6;
  const key = `review-upload:${ip}`;
  const recent = (requestHistory.get(key) || []).filter((time) => now - time < interval);
  recent.push(now);
  requestHistory.set(key, recent);
  return recent.length > limit;
}

function parseForm(req) {
  return new Promise((resolve, reject) => {
    const fields = {};
    const attachments = [];
    let totalFileSize = 0;
    let parsingFailed = false;
    const parser = Busboy({
      headers: req.headers,
      limits: {
        fields: 20,
        fieldSize: 10000,
        files: MAX_FILES,
        fileSize: MAX_FILE_SIZE,
      },
    });

    parser.on("field", (name, value) => {
      fields[name] = value;
    });

    parser.on("file", (name, stream, info) => {
      const chunks = [];
      let fileSize = 0;

      stream.on("data", (chunk) => {
        fileSize += chunk.length;
        totalFileSize += chunk.length;
        if (totalFileSize > MAX_TOTAL_FILE_SIZE) parsingFailed = true;
        chunks.push(chunk);
      });
      stream.on("limit", () => {
        parsingFailed = true;
      });
      stream.on("end", () => {
        if (!parsingFailed && fileSize > 0 && info.mimeType.startsWith("image/")) {
          attachments.push({
            filename: cleanText(info.filename, 120) || "imagine",
            content: Buffer.concat(chunks),
            contentType: info.mimeType,
            size: fileSize,
          });
        }
      });
    });

    parser.on("filesLimit", () => {
      parsingFailed = true;
    });
    parser.on("error", reject);
    parser.on("finish", () => {
      if (parsingFailed) {
        reject(new Error("attachments-too-large"));
        return;
      }
      resolve({fields, attachments});
    });

    parser.end(req.rawBody);
  });
}

function parseReviewForm(req) {
  return new Promise((resolve, reject) => {
    const fields = {};
    let parsingFailed = false;
    const parser = Busboy({
      headers: req.headers,
      limits: {
        fields: 16,
        fieldSize: 5000,
        files: 1,
        fileSize: MAX_REVIEW_IMAGE_SIZE,
      },
    });

    parser.on("field", (name, value) => {
      fields[name] = value;
    });

    parser.on("file", (name, stream, info) => {
      let fileSize = 0;

      stream.on("data", (chunk) => {
        fileSize += chunk.length;
      });
      stream.on("limit", () => {
        parsingFailed = true;
      });
      stream.on("end", () => {
        if (!fileSize) return;
        console.warn("Review-ul a încercat să trimită o imagine direct către Firebase; uploadul trebuie făcut prin Cloudinary.", {
          field: name,
          contentType: info.mimeType,
        });
        parsingFailed = true;
      });
    });

    parser.on("filesLimit", () => {
      parsingFailed = true;
    });
    parser.on("error", reject);
    parser.on("finish", () => {
      if (parsingFailed) {
        reject(new Error("invalid-review-image"));
        return;
      }
      resolve({fields});
    });

    parser.end(req.rawBody);
  });
}

function displayNameFromName(name) {
  const parts = cleanText(name, 100).split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

function reviewPublicData(doc) {
  const data = doc.data();
  return {
    id: doc.id,
    displayName: data.displayName || "Client Ade's Soft Stitches",
    rating: Number(data.rating) || 5,
    message: data.message || "",
    productName: data.productName || "",
    imageUrl: data.imageUrl || "",
    likesCount: Number(data.likesCount) || 0,
    createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : null,
  };
}

function requireAdmin(req) {
  const header = req.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return token && token === reviewAdminToken.value();
}

function requireProductAdmin(req) {
  const header = req.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return token && token === productAdminToken.value();
}

function catalogDatabase() {
  const url = cleanText(catalogDatabaseUrl.value(), 300);
  return admin.app().database(url);
}

function slugify(value) {
  return cleanText(value, 120)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 90);
}

function normalizeStringArray(value, maxItems = 30, maxLength = 180) {
  const source = Array.isArray(value) ? value : String(value || "").split(/[,\n]/);
  return source
      .map((item) => cleanText(item, maxLength))
      .filter(Boolean)
      .slice(0, maxItems);
}

function normalizeSpecs(value) {
  const specs = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const allowed = ["Dimensiune", "Materiale", "Disponibilitate"];
  return allowed.reduce((result, key) => {
    const text = cleanText(specs[key], key === "Materiale" ? 500 : 220);
    if (text) result[key] = text;
    return result;
  }, {});
}

function normalizeProductImages(images, publicIds) {
  const urls = normalizeStringArray(images, 6, 1000).filter((url) =>
    /^https:\/\/res\.cloudinary\.com\/[a-z0-9_-]+\/image\/upload\//i.test(url),
  );
  const ids = normalizeStringArray(publicIds, 6, 260).filter((id) =>
    id.startsWith(`${CLOUDINARY_PRODUCT_FOLDER}/`),
  );
  return {urls, ids};
}

function normalizeProductPayload(input = {}) {
  const id = slugify(input.id || input.nume);
  const colectie = cleanText(input.colectie, 60);
  const nume = cleanText(input.nume, 140);
  const pret = cleanText(input.pret, 80);
  const descriere = cleanText(input.descriere, 1200);
  const ordineRaw = Number(input.ordine);
  const ordine = Number.isFinite(ordineRaw) ? ordineRaw : 9999;
  const filtre = normalizeStringArray(input.filtre, 24, 80);
  const specificatii = normalizeSpecs(input.specificatii);
  const {urls, ids} = normalizeProductImages(input.imagini, input.imagePublicIds);

  if (!id || !["disponibile", "la-comanda"].includes(colectie) || !nume || !pret || !descriere || !urls.length) {
    throw new Error("invalid-product");
  }

  return {
    id,
    colectie,
    nume,
    pret,
    descriere,
    filtre,
    specificatii,
    imagini: urls,
    imagePublicIds: ids,
    ordine,
    ascuns: Boolean(input.ascuns),
    status: input.ascuns ? "hidden" : "public",
    updatedAt: Date.now(),
  };
}

function cloudinaryConfig() {
  const cloudName = cleanText(cloudinaryCloudName.value(), 120);
  const apiKey = cleanText(cloudinaryApiKey.value(), 120);
  const apiSecret = String(cloudinaryApiSecret.value() || "").trim();
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("cloudinary-not-configured");
  }
  return {cloudName, apiKey, apiSecret};
}

function signCloudinaryParams(params, apiSecret) {
  const payload = Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join("&");
  return crypto.createHash("sha1").update(`${payload}${apiSecret}`).digest("hex");
}

function validCloudinaryReviewImage(imageUrl, publicId, provider) {
  if (!imageUrl && !publicId) return {imageUrl: "", imagePublicId: "", imageProvider: ""};
  const cleanUrl = cleanText(imageUrl, 1000);
  const cleanPublicId = cleanText(publicId, 220);
  const cleanProvider = cleanText(provider, 40);
  const isCloudinaryUrl = /^https:\/\/res\.cloudinary\.com\/[a-z0-9_-]+\/image\/upload\//i.test(cleanUrl);
  if (cleanProvider !== "cloudinary" || !isCloudinaryUrl || !cleanPublicId.startsWith(`${CLOUDINARY_REVIEW_FOLDER}/`)) {
    throw new Error("invalid-review-image");
  }
  return {
    imageUrl: cleanUrl,
    imagePublicId: cleanPublicId,
    imageProvider: "cloudinary",
  };
}

async function destroyCloudinaryImage(publicId, contextLabel) {
  const cleanPublicId = cleanText(publicId, 260);
  if (!cleanPublicId) return;

  try {
    const {cloudName, apiKey, apiSecret} = cloudinaryConfig();
    const timestamp = Math.floor(Date.now() / 1000);
    const params = {
      invalidate: "true",
      public_id: cleanPublicId,
      timestamp,
    };
    const formData = new URLSearchParams({
      ...params,
      api_key: apiKey,
      signature: signCloudinaryParams(params, apiSecret),
    });
    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, {
      method: "POST",
      body: formData,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || (result.result && !["ok", "not found"].includes(result.result))) {
      console.warn(`${contextLabel} nu a putut fi ștearsă din Cloudinary.`, {
        publicId: cleanPublicId,
        status: response.status,
        result: result.result,
      });
    }
  } catch (error) {
    console.warn(`${contextLabel} nu a putut fi ștearsă din Cloudinary.`, {
      publicId: cleanPublicId,
      message: error.message,
    });
  }
}

async function deleteReviewImage(reviewData) {
  const imagePublicId = cleanText(reviewData?.imagePublicId, 220);
  const imageProvider = cleanText(reviewData?.imageProvider, 40);
  if (imageProvider === "cloudinary" && imagePublicId) {
    await destroyCloudinaryImage(imagePublicId, "Poza review-ului");
    return;
  }

  const imagePath = cleanText(reviewData?.imagePath, 500);
  if (!imagePath) return;
  try {
    await admin.storage().bucket().file(imagePath).delete({ignoreNotFound: true});
  } catch (error) {
    console.warn("Poza review-ului vechi nu a putut fi ștearsă din Firebase Storage.", {
      imagePath,
      message: error.message,
    });
  }
}

async function deleteProductImages(productData) {
  const publicIds = normalizeStringArray(productData?.imagePublicIds, 20, 260)
      .filter((id) => id.startsWith(`${CLOUDINARY_PRODUCT_FOLDER}/`));
  await Promise.all(publicIds.map((publicId) => destroyCloudinaryImage(publicId, "Poza produsului")));
}

function ownerEmailContent(data) {
  const rows = [
    ["Nume", data.nume],
    ["Email", data.email],
    ["Telefon", data.telefon || "Nu a fost completat"],
    ["Model ales", data.model],
    ["Detalii", data.detalii || "Fără modificări menționate"],
    ["ID comandă", data.orderId || "Nu este disponibil"],
    ["Atașamente salvate", data.attachmentsCount ? String(data.attachmentsCount) : "Nu"],
  ];
  const text = rows.map(([label, value]) => `${label}: ${value}`).join("\n\n");
  const html = rows.map(([label, value]) =>
    `<p><strong>${escapeHtml(label)}:</strong><br>${escapeHtml(value).replaceAll("\n", "<br>")}</p>`,
  ).join("");
  return {text, html};
}

function reviewOwnerEmailContent(data) {
  const rows = [
    ["Nume public", data.displayName],
    ["Nume complet", data.name],
    ["Email", data.email],
    ["Rating", `${data.rating}/5`],
    ["Produs", data.productName || "Nu a fost completat"],
    ["Mesaj", data.message],
    ["Poză", data.imageUrl ? "Da, verifică review-ul în admin." : "Nu"],
    ["ID review", data.reviewId || "Nu este disponibil"],
  ];
  const text = rows.map(([label, value]) => `${label}: ${value}`).join("\n\n");
  const html = rows.map(([label, value]) =>
    `<p><strong>${escapeHtml(label)}:</strong><br>${escapeHtml(value).replaceAll("\n", "<br>")}</p>`,
  ).join("");
  return {text, html};
}

function createGmailTransporter() {
  const user = cleanText(gmailUser.value() || DEFAULT_OWNER_EMAIL, 254).toLowerCase();
  const pass = String(gmailAppPassword.value() || "").replace(/\s+/g, "").trim();

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user,
      pass,
    },
  });
}

function emailSender() {
  const user = cleanText(gmailUser.value() || DEFAULT_OWNER_EMAIL, 254).toLowerCase();
  const name = cleanText(emailSenderName.value() || "Ade’s Soft Stitches", 80);
  return `${name} <${user}>`;
}

function withTimeout(promise, timeoutMs, label) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({timedOut: true, label}), timeoutMs);
  });
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    timeout,
  ]);
}

async function uploadOrderAttachments(orderId, attachments) {
  if (!attachments.length) return [];

  const bucket = admin.storage().bucket();
  const uploads = attachments.map(async (attachment, index) => {
    const safeName = attachment.filename.replace(/[^\w.\-]+/g, "_").slice(0, 90) || `imagine-${index + 1}`;
    const imagePath = `orders/${orderId}/attachments/${String(index + 1).padStart(2, "0")}-${safeName}`;
    const file = bucket.file(imagePath);

    await file.save(attachment.content, {
      metadata: {
        contentType: attachment.contentType,
        cacheControl: "private, max-age=0, no-store",
      },
      resumable: false,
      validation: "md5",
    });

    return {
      filename: attachment.filename,
      contentType: attachment.contentType,
      size: attachment.size,
      imagePath,
    };
  });

  return Promise.all(uploads);
}

const clientText = `Bună! 💕

Îți mulțumesc că mi-ai scris. Am primit mesajul tău și revin către tine cât de curând cu un răspuns.

Între timp, îți mulțumesc pentru răbdare și pentru interesul acordat creațiilor Ade’s Soft Stitches. 🧶✨

Cu drag,
Ade’s Soft Stitches`;

const reviewClientText = `Bună! 💕

Îți mulțumesc mult pentru review. Am primit mesajul tău și îl voi verifica înainte să apară pe site.

Mă bucur mult că ai făcut parte din povestea Ade’s Soft Stitches. 🧶✨

Cu drag,
Ade’s Soft Stitches`;

exports.trimiteComanda = onRequest({
  region: "europe-west1",
  secrets: [gmailAppPassword],
  timeoutSeconds: 60,
  memory: "256MiB",
  maxInstances: 5,
}, async (req, res) => {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ok: false, error: "method-not-allowed"});
    return;
  }

  const origin = req.get("origin");
  if (origin && res.get("Access-Control-Allow-Origin") !== origin) {
    res.status(403).json({ok: false, error: "origin-not-allowed"});
    return;
  }

  const ip = req.get("x-forwarded-for")?.split(",")[0].trim() || req.ip || "unknown";
  if (isRateLimited(ip)) {
    res.status(429).json({ok: false, error: "too-many-requests"});
    return;
  }

  try {
    const {fields, attachments} = await parseForm(req);
    if (fields.website) {
      res.status(200).json({ok: true});
      return;
    }

    const data = {
      nume: cleanText(fields.nume, 100),
      email: cleanText(fields.email, 254).toLowerCase(),
      telefon: cleanText(fields.telefon, 40),
      model: cleanText(fields.model_ales, 180),
      detalii: cleanText(fields.detalii, 5000),
    };

    if (!data.nume || !emailPattern.test(data.email) || !data.model) {
      res.status(400).json({ok: false, error: "invalid-form"});
      return;
    }
    if (fields.acord_contact !== "on") {
      res.status(400).json({ok: false, error: "consent-required"});
      return;
    }

    const orderRef = admin.firestore().collection("orders").doc();
    const savedAttachments = await uploadOrderAttachments(orderRef.id, attachments);
    const orderData = {
      name: data.nume,
      email: data.email,
      phone: data.telefon,
      selectedModel: data.model,
      details: data.detalii,
      status: "new",
      source: "website",
      attachments: savedAttachments,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      emailStatus: "pending",
    };

    await orderRef.set(orderData);

    let emailStatus = "sent";
    try {
      const transporter = createGmailTransporter();
      const ownerContent = ownerEmailContent({
        ...data,
        orderId: orderRef.id,
        attachmentsCount: savedAttachments.length,
      });
      const sender = emailSender();
      const ownerEmail = cleanText(gmailUser.value() || DEFAULT_OWNER_EMAIL, 254).toLowerCase();

      const results = await withTimeout(Promise.allSettled([
        transporter.sendMail({
          from: sender,
          to: ownerEmail,
          replyTo: data.email,
          subject: `Comandă nouă de la ${data.nume}`,
          text: ownerContent.text,
          html: ownerContent.html,
        }),
        transporter.sendMail({
          from: sender,
          to: data.email,
          replyTo: ownerEmail,
          subject: "Mesajul tău a ajuns la mine 💌",
          text: clientText,
        }),
      ]), 2000, "order-email");

      if (results.timedOut) {
        emailStatus = "pending";
        console.warn("Comanda a fost salvată, dar trimiterea emailului încă nu a răspuns.", {
          orderId: orderRef.id,
        });
      } else if (results.some((result) => result.status === "rejected")) {
        emailStatus = "failed";
        console.error("Comanda a fost salvată, dar trimiterea emailului a eșuat.", {
          orderId: orderRef.id,
          failures: results
              .filter((result) => result.status === "rejected")
              .map((result) => ({
                code: result.reason?.code,
                responseCode: result.reason?.responseCode,
                command: result.reason?.command,
                message: result.reason?.message,
              })),
        });
      }
    } catch (emailError) {
      emailStatus = "failed";
      console.error("Comanda a fost salvată, dar emailul nu a putut fi trimis.", {
        orderId: orderRef.id,
        code: emailError.code,
        responseCode: emailError.responseCode,
        command: emailError.command,
        message: emailError.message,
      });
    }

    await orderRef.update({
      emailStatus,
      emailProcessedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(200).json({ok: true, orderId: orderRef.id, emailStatus});
  } catch (error) {
    console.error("Cererea nu a putut fi procesată.", error);
    const status = error.message === "attachments-too-large" ? 413 : 500;
    res.status(status).json({
      ok: false,
      error: error.message === "attachments-too-large" ? "attachments-too-large" : "server-error",
    });
  }
});

exports.trimiteReview = onRequest({
  region: "europe-west1",
  secrets: [gmailAppPassword],
  timeoutSeconds: 60,
  memory: "256MiB",
  maxInstances: 4,
}, async (req, res) => {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ok: false, error: "method-not-allowed"});
    return;
  }

  const origin = req.get("origin");
  if (origin && res.get("Access-Control-Allow-Origin") !== origin) {
    res.status(403).json({ok: false, error: "origin-not-allowed"});
    return;
  }

  const ip = req.get("x-forwarded-for")?.split(",")[0].trim() || req.ip || "unknown";
  if (isReviewRateLimited(ip, origin)) {
    res.status(429).json({ok: false, error: "too-many-requests"});
    return;
  }

  try {
    const {fields} = await parseReviewForm(req);
    if (fields.website) {
      res.status(200).json({ok: true});
      return;
    }

    const name = cleanText(fields.nume, 100);
    const email = cleanText(fields.email, 254).toLowerCase();
    const rating = Number(fields.rating);
    const rawMessage = cleanText(fields.mesaj, 1200);
    const message = cleanText(fields.mesaj, MAX_REVIEW_MESSAGE_LENGTH);
    const productName = cleanText(fields.produs, 120);
    const consentToPublish = fields.acord_publicare === "on";
    const uploaded = validCloudinaryReviewImage(
        fields.imageUrl,
        fields.imagePublicId,
        fields.imageProvider,
    );

    if (!name || !emailPattern.test(email) || !Number.isInteger(rating) || rating < 1 || rating > 5 || rawMessage.length > MAX_REVIEW_MESSAGE_LENGTH || message.length < 10 || !consentToPublish) {
      res.status(400).json({ok: false, error: "invalid-review"});
      return;
    }

    const reviewRef = admin.firestore().collection("reviews").doc();
    const reviewData = {
      name,
      email,
      displayName: displayNameFromName(name),
      rating,
      message,
      productName,
      imageUrl: uploaded.imageUrl,
      imagePublicId: uploaded.imagePublicId,
      imageProvider: uploaded.imageProvider,
      likesCount: 0,
      status: "pending",
      consentToPublish,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      approvedAt: null,
      source: "website",
    };

    await reviewRef.set(reviewData);

    let emailStatus = "sent";
    try {
      const transporter = createGmailTransporter();
      const ownerEmail = cleanText(gmailUser.value() || DEFAULT_OWNER_EMAIL, 254).toLowerCase();
      const ownerContent = reviewOwnerEmailContent({...reviewData, reviewId: reviewRef.id});
      const sender = emailSender();
      const results = await withTimeout(Promise.allSettled([
        transporter.sendMail({
          from: sender,
          to: ownerEmail,
          replyTo: email,
          subject: `Review nou de verificat de la ${reviewData.displayName}`,
          text: ownerContent.text,
          html: ownerContent.html,
        }),
        transporter.sendMail({
          from: sender,
          to: email,
          replyTo: ownerEmail,
          subject: "Mulțumesc pentru review 💕",
          text: reviewClientText,
        }),
      ]), 2000, "review-email");

      if (results.timedOut) {
        emailStatus = "pending";
        console.warn("Review-ul a fost salvat, dar trimiterea emailului încă nu a răspuns.", {
          reviewId: reviewRef.id,
        });
      } else if (results.some((result) => result.status === "rejected")) {
        emailStatus = "failed";
        console.error("Review-ul a fost salvat, dar trimiterea emailului a eșuat.", {
          reviewId: reviewRef.id,
          failures: results
              .filter((result) => result.status === "rejected")
              .map((result) => ({
                code: result.reason?.code,
                responseCode: result.reason?.responseCode,
                command: result.reason?.command,
                message: result.reason?.message,
              })),
        });
      }
    } catch (emailError) {
      emailStatus = "failed";
      console.error("Review-ul a fost salvat, dar notificarea email a eșuat.", {
        reviewId: reviewRef.id,
        code: emailError.code,
        responseCode: emailError.responseCode,
        command: emailError.command,
        message: emailError.message,
      });
    }

    await reviewRef.update({
      emailStatus,
      emailProcessedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(200).json({ok: true, reviewId: reviewRef.id, emailStatus});
  } catch (error) {
    console.error("Review-ul nu a putut fi procesat.", error);
    const status = error.message === "invalid-review-image" ? 413 : 500;
    res.status(status).json({
      ok: false,
      error: error.message === "invalid-review-image" ? "invalid-review-image" : "server-error",
    });
  }
});

exports.semneazaUploadReview = onRequest({
  region: "europe-west1",
  secrets: [cloudinaryCloudName, cloudinaryApiKey, cloudinaryApiSecret],
  timeoutSeconds: 30,
  memory: "256MiB",
  maxInstances: 4,
}, async (req, res) => {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ok: false, error: "method-not-allowed"});
    return;
  }

  const origin = req.get("origin");
  if (origin && res.get("Access-Control-Allow-Origin") !== origin) {
    res.status(403).json({ok: false, error: "origin-not-allowed"});
    return;
  }

  const ip = req.get("x-forwarded-for")?.split(",")[0].trim() || req.ip || "unknown";
  if (isReviewUploadRateLimited(ip, origin)) {
    res.status(429).json({ok: false, error: "too-many-requests"});
    return;
  }

  try {
    const contentType = cleanText(req.body?.contentType, 80);
    const fileSize = Number(req.body?.fileSize) || 0;
    if (!REVIEW_IMAGE_TYPES.has(contentType) || fileSize <= 0 || fileSize > MAX_REVIEW_IMAGE_SIZE) {
      res.status(400).json({ok: false, error: "invalid-review-image"});
      return;
    }

    const {cloudName, apiKey, apiSecret} = cloudinaryConfig();
    const timestamp = Math.floor(Date.now() / 1000);
    const params = {
      folder: CLOUDINARY_REVIEW_FOLDER,
      timestamp,
    };
    const signature = signCloudinaryParams(params, apiSecret);

    res.status(200).json({
      ok: true,
      cloudName,
      apiKey,
      folder: CLOUDINARY_REVIEW_FOLDER,
      timestamp,
      signature,
    });
  } catch (error) {
    console.error("Semnătura Cloudinary pentru review nu a putut fi generată.", {
      message: error.message,
    });
    res.status(500).json({ok: false, error: "cloudinary-not-configured"});
  }
});

exports.semneazaUploadProdus = onRequest({
  region: "europe-west1",
  secrets: [productAdminToken, cloudinaryCloudName, cloudinaryApiKey, cloudinaryApiSecret],
  timeoutSeconds: 30,
  memory: "256MiB",
  maxInstances: 3,
}, async (req, res) => {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ok: false, error: "method-not-allowed"});
    return;
  }

  const origin = req.get("origin");
  if (origin && res.get("Access-Control-Allow-Origin") !== origin) {
    res.status(403).json({ok: false, error: "origin-not-allowed"});
    return;
  }
  if (!requireProductAdmin(req)) {
    res.status(401).json({ok: false, error: "admin-required"});
    return;
  }

  try {
    const contentType = cleanText(req.body?.contentType, 80);
    const fileSize = Number(req.body?.fileSize) || 0;
    if (!PRODUCT_IMAGE_TYPES.has(contentType) || fileSize <= 0 || fileSize > MAX_REVIEW_IMAGE_SIZE) {
      res.status(400).json({ok: false, error: "invalid-product-image"});
      return;
    }

    const {cloudName, apiKey, apiSecret} = cloudinaryConfig();
    const timestamp = Math.floor(Date.now() / 1000);
    const params = {
      folder: CLOUDINARY_PRODUCT_FOLDER,
      timestamp,
    };
    const signature = signCloudinaryParams(params, apiSecret);

    res.status(200).json({
      ok: true,
      cloudName,
      apiKey,
      folder: CLOUDINARY_PRODUCT_FOLDER,
      timestamp,
      signature,
    });
  } catch (error) {
    console.error("Semnătura Cloudinary pentru produs nu a putut fi generată.", {
      message: error.message,
    });
    res.status(500).json({ok: false, error: "cloudinary-not-configured"});
  }
});

exports.reviewuriPublice = onRequest({
  region: "europe-west1",
  timeoutSeconds: 30,
  memory: "256MiB",
  maxInstances: 4,
}, async (req, res) => {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  if (req.method !== "GET") {
    res.status(405).json({ok: false, error: "method-not-allowed"});
    return;
  }

  const origin = req.get("origin");
  if (origin && res.get("Access-Control-Allow-Origin") !== origin) {
    res.status(403).json({ok: false, error: "origin-not-allowed"});
    return;
  }

  const limit = Math.max(1, Math.min(Number(req.query.limit) || 6, 12));
  const sort = req.query.sort === "likes" ? "likes" : "recent";

  try {
    let query = admin.firestore()
        .collection("reviews")
        .where("status", "==", "approved");

    query = sort === "likes" ?
      query.orderBy("likesCount", "desc").orderBy("approvedAt", "desc") :
      query.orderBy("approvedAt", "desc");

    const snapshot = await query.limit(limit).get();

    res.set("Cache-Control", "public, max-age=300, s-maxage=600");
    res.status(200).json({
      ok: true,
      reviews: snapshot.docs.map(reviewPublicData),
    });
  } catch (error) {
    console.error("Review-urile publice nu au putut fi încărcate.", error);
    res.status(500).json({ok: false, error: "server-error"});
  }
});

exports.apreciazaReview = onRequest({
  region: "europe-west1",
  timeoutSeconds: 30,
  memory: "256MiB",
  maxInstances: 4,
}, async (req, res) => {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ok: false, error: "method-not-allowed"});
    return;
  }

  const origin = req.get("origin");
  if (origin && res.get("Access-Control-Allow-Origin") !== origin) {
    res.status(403).json({ok: false, error: "origin-not-allowed"});
    return;
  }

  const ip = req.get("x-forwarded-for")?.split(",")[0].trim() || req.ip || "unknown";
  if (isLikeRateLimited(ip)) {
    res.status(429).json({ok: false, error: "too-many-requests"});
    return;
  }

  try {
    const reviewId = cleanText(req.body?.id, 140);
    if (!reviewId) {
      res.status(400).json({ok: false, error: "invalid-review"});
      return;
    }

    const reviewRef = admin.firestore().collection("reviews").doc(reviewId);
    const likesCount = await admin.firestore().runTransaction(async (transaction) => {
      const reviewDoc = await transaction.get(reviewRef);
      if (!reviewDoc.exists || reviewDoc.data().status !== "approved") {
        throw new Error("review-not-found");
      }

      const nextLikesCount = (Number(reviewDoc.data().likesCount) || 0) + 1;
      transaction.update(reviewRef, {likesCount: nextLikesCount});
      return nextLikesCount;
    });

    res.status(200).json({ok: true, likesCount});
  } catch (error) {
    if (error.message === "review-not-found") {
      res.status(404).json({ok: false, error: "not-found"});
      return;
    }
    console.error("Review-ul nu a putut fi apreciat.", error);
    res.status(500).json({ok: false, error: "server-error"});
  }
});

exports.adminReviewuri = onRequest({
  region: "europe-west1",
  secrets: [reviewAdminToken, cloudinaryCloudName, cloudinaryApiKey, cloudinaryApiSecret],
  timeoutSeconds: 60,
  memory: "256MiB",
  maxInstances: 2,
}, async (req, res) => {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  const origin = req.get("origin");
  if (origin && res.get("Access-Control-Allow-Origin") !== origin) {
    res.status(403).json({ok: false, error: "origin-not-allowed"});
    return;
  }

  if (!requireAdmin(req)) {
    res.status(401).json({ok: false, error: "admin-required"});
    return;
  }

  try {
    if (req.method === "GET") {
      const status = REVIEW_STATUSES.has(String(req.query.status)) ? String(req.query.status) : "pending";
      const snapshot = await admin.firestore()
          .collection("reviews")
          .where("status", "==", status)
          .orderBy("createdAt", "desc")
          .limit(30)
          .get();

      res.status(200).json({
        ok: true,
        reviews: snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()})),
      });
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ok: false, error: "method-not-allowed"});
      return;
    }

    const {id, action} = req.body || {};
    const reviewId = cleanText(id, 140);
    if (!reviewId || !["approve", "reject", "delete"].includes(action)) {
      res.status(400).json({ok: false, error: "invalid-action"});
      return;
    }

    const reviewRef = admin.firestore().collection("reviews").doc(reviewId);
    const reviewDoc = await reviewRef.get();
    if (!reviewDoc.exists) {
      res.status(404).json({ok: false, error: "not-found"});
      return;
    }

    if (action === "delete") {
      await deleteReviewImage(reviewDoc.data());
      await reviewRef.delete();
    } else {
      await reviewRef.update({
        status: action === "approve" ? "approved" : "rejected",
        approvedAt: action === "approve" ? admin.firestore.FieldValue.serverTimestamp() : null,
        likesCount: Number(reviewDoc.data().likesCount) || 0,
      });
    }

    res.status(200).json({ok: true});
  } catch (error) {
    console.error("Administrarea review-urilor a eșuat.", error);
    res.status(500).json({ok: false, error: "server-error"});
  }
});

exports.adminProduse = onRequest({
  region: "europe-west1",
  secrets: [productAdminToken, cloudinaryCloudName, cloudinaryApiKey, cloudinaryApiSecret],
  timeoutSeconds: 60,
  memory: "256MiB",
  maxInstances: 2,
}, async (req, res) => {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  const origin = req.get("origin");
  if (origin && res.get("Access-Control-Allow-Origin") !== origin) {
    res.status(403).json({ok: false, error: "origin-not-allowed"});
    return;
  }
  if (!requireProductAdmin(req)) {
    res.status(401).json({ok: false, error: "admin-required"});
    return;
  }

  try {
    const database = catalogDatabase();

    if (req.method === "GET") {
      const snapshot = await database.ref("/").get();
      const catalog = snapshot.val() || {};
      res.status(200).json({
        ok: true,
        colectii: catalog.colectii || {},
        produse: catalog.produse || {},
      });
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ok: false, error: "method-not-allowed"});
      return;
    }

    const {action} = req.body || {};
    const productId = slugify(req.body?.id);
    const productRef = productId ? database.ref(`/produse/${productId}`) : null;

    if (action === "save") {
      const product = normalizeProductPayload(req.body?.product || {});
      await database.ref(`/produse/${product.id}`).set(product);
      res.status(200).json({ok: true, product});
      return;
    }

    if (!productId || !productRef) {
      res.status(400).json({ok: false, error: "invalid-product"});
      return;
    }

    const productSnapshot = await productRef.get();
    if (!productSnapshot.exists()) {
      res.status(404).json({ok: false, error: "not-found"});
      return;
    }

    if (action === "toggle") {
      const ascuns = Boolean(req.body?.ascuns);
      await productRef.update({
        ascuns,
        status: ascuns ? "hidden" : "public",
        updatedAt: Date.now(),
      });
      res.status(200).json({ok: true});
      return;
    }

    if (action === "delete") {
      await deleteProductImages(productSnapshot.val());
      await productRef.remove();
      res.status(200).json({ok: true});
      return;
    }

    res.status(400).json({ok: false, error: "invalid-action"});
  } catch (error) {
    const status = error.message === "invalid-product" ? 400 : 500;
    console.error("Administrarea produselor a eșuat.", {
      message: error.message,
      code: error.code,
    });
    res.status(status).json({
      ok: false,
      error: error.message === "invalid-product" ? "invalid-product" : "server-error",
    });
  }
});
