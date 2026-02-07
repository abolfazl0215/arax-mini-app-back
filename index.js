require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const OpenAI = require("openai");
const TelegramBot = require("node-telegram-bot-api");

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// OpenAI Configuration
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ==================== TELEGRAM BOT CONFIGURATION ====================

const BOT_TOKEN = process.env.BOT_TOKEN;
const MINI_APP_URL = process.env.MINI_APP_URL;
const SUPPORT_USERNAME =
  process.env.SUPPORT_USERNAME || "araks_support";
const ADMIN_TELEGRAM_IDS = process.env.ADMIN_TELEGRAM_IDS
  ? process.env.ADMIN_TELEGRAM_IDS.split(",")
  : []; // مثال: "123456789,987654321"

// ایجاد ربات تلگرام (فقط اگر BOT_TOKEN موجود باشد)
let bot;
if (BOT_TOKEN) {
  bot = new TelegramBot(BOT_TOKEN, { polling: true });
  console.log("🤖 Telegram Bot started successfully!");
} else {
  console.log("⚠️  BOT_TOKEN not found. Telegram bot is disabled.");
}

// MongoDB Connection
mongoose
  .connect(
    "mongodb+srv://xchat:Abolfazl021_@db1.6qsnqns.mongodb.net/?appName=db1",
  )
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// ==================== DATABASE SCHEMAS ====================

// User Schema
const userSchema = new mongoose.Schema(
  {
    telegramId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    imageUrl: {
      type: String,
      default: "",
    },
    userName: {
      type: String,
      default: "",
    },
    fullName: {
      type: String,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastActivity: {
      type: Date,
      default: Date.now,
    },
    chat: [
      {
        message: {
          type: String,
          required: true,
        },
        time: {
          type: Date,
          default: Date.now,
        },
        from: {
          type: String,
          enum: ["ai", "user", "admin"],
          required: true,
        },
      },
    ],
  },
  { timestamps: true },
);

const User = mongoose.model("AraxUser", userSchema);

// Analytics Schema - برای ذخیره آمار بازدیدها
const analyticsSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
    index: true,
  },
  miniAppVisits: {
    type: Number,
    default: 0,
  },
  newUsers: {
    type: Number,
    default: 0,
  },
  totalMessages: {
    type: Number,
    default: 0,
  },
  userMessages: {
    type: Number,
    default: 0,
  },
  aiMessages: {
    type: Number,
    default: 0,
  },
  adminMessages: {
    type: Number,
    default: 0,
  },
  activeUsers: {
    type: Number,
    default: 0,
  },
  botCommands: {
    start: { type: Number, default: 0 },
    help: { type: Number, default: 0 },
    services: { type: Number, default: 0 },
    contact: { type: Number, default: 0 },
  },
});

const Analytics = mongoose.model("AnalyticsArax", analyticsSchema);

// Broadcast Schema - برای ذخیره پیام‌های ارسالی به همه
const broadcastSchema = new mongoose.Schema({
  message: {
    type: String,
    required: true,
  },
  sentBy: {
    type: String,
    required: true,
  },
  sentAt: {
    type: Date,
    default: Date.now,
  },
  recipientsCount: {
    type: Number,
    default: 0,
  },
  successCount: {
    type: Number,
    default: 0,
  },
  failureCount: {
    type: Number,
    default: 0,
  },
  status: {
    type: String,
    enum: ["pending", "sending", "completed", "failed"],
    default: "pending",
  },
});

const Broadcast = mongoose.model("BroadcastArax", broadcastSchema);

// بعد از Broadcast Schema اضافه کن:

// Package Schema - برای پکیج‌های اقامت
const packageSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  titleEn: {
    type: String,
    default: "",
  },
  duration: {
    type: String,
    required: true,
  },
  price: {
    type: Number,
    required: true,
  },
  priceText: {
    type: String,
    default: "",
  },
  description: {
    type: String,
    required: true,
  },
  icon: {
    type: String,
    default: "Building2",
  },
  features: [String],
  popular: {
    type: Boolean,
    default: false,
  },
  gradient: {
    type: String,
    default: "from-blue-500 to-purple-500",
  },
  longDescription: {
    type: String,
    default: "",
  },
  benefits: [String],
  requirements: [String],
  process: [String],
  contactRequired: {
    type: Boolean,
    default: false,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  order: {
    type: Number,
    default: 0,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

const Package = mongoose.model("PackageArax", packageSchema);

// Discount Campaign Schema - برای کمپین‌های تخفیف
const discountCampaignSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    default: "",
  },
  discountType: {
    type: String,
    enum: ["percentage", "fixed"],
    default: "percentage",
  },
  discountValue: {
    type: Number,
    required: true,
  },
  packages: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PackageArax",
    },
  ],
  startDate: {
    type: Date,
    required: true,
  },
  endDate: {
    type: Date,
    required: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  notificationSent: {
    type: Boolean,
    default: false,
  },
  notificationMessage: {
    type: String,
    default: "",
  },
  createdBy: {
    type: String,
    default: "",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const DiscountCampaign = mongoose.model(
  "DiscountCampaignArax",
  discountCampaignSchema,
);

// ==================== HELPER FUNCTIONS ====================

// بعد از updateActiveUsersCount() اضافه کن:

// تابع برای محاسبه قیمت با تخفیف
async function calculateDiscountedPrice(packageId, originalPrice) {
  try {
    const now = new Date();

    const activeCampaign = await DiscountCampaign.findOne({
      packages: packageId,
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now },
    }).sort({ createdAt: -1 });

    if (!activeCampaign) {
      return {
        hasDiscount: false,
        originalPrice,
        discountedPrice: originalPrice,
        discountPercentage: 0,
        campaignEndDate: null,
      };
    }

    let discountedPrice = originalPrice;
    let discountPercentage = 0;

    if (activeCampaign.discountType === "percentage") {
      discountPercentage = activeCampaign.discountValue;
      discountedPrice =
        originalPrice -
        (originalPrice * activeCampaign.discountValue) / 100;
    } else {
      discountedPrice = originalPrice - activeCampaign.discountValue;
      discountPercentage =
        ((originalPrice - discountedPrice) / originalPrice) * 100;
    }

    return {
      hasDiscount: true,
      originalPrice,
      discountedPrice: Math.max(0, Math.round(discountedPrice)),
      discountPercentage: Math.round(discountPercentage),
      campaignEndDate: activeCampaign.endDate,
      campaignName: activeCampaign.name,
    };
  } catch (error) {
    console.error("Error calculating discount:", error);
    return {
      hasDiscount: false,
      originalPrice,
      discountedPrice: originalPrice,
      discountPercentage: 0,
      campaignEndDate: null,
    };
  }
}

// تابع برای ارسال نوتیفیکیشن شروع تخفیف
async function sendDiscountNotification(campaignId) {
  try {
    const campaign =
      await DiscountCampaign.findById(campaignId).populate(
        "packages",
      );

    if (!campaign || campaign.notificationSent || !bot) {
      return;
    }

    const users = await User.find({ isActive: true });

    let message = campaign.notificationMessage;

    if (!message) {
      const packageNames = campaign.packages
        .map((p) => p.title)
        .join("، ");
      message = `🎉 کمپین تخفیف ویژه! 🎉\n\n`;
      message += `${campaign.name}\n\n`;
      message += `📦 پکیج‌ها: ${packageNames}\n`;
      message += `💰 تخفیف: ${campaign.discountValue}${campaign.discountType === "percentage" ? "%" : "$"}\n`;
      message += `⏰ تا تاریخ: ${new Date(campaign.endDate).toLocaleDateString("fa-IR")}\n\n`;
      message += `برای مشاهده و استفاده از تخفیف، مینی اپ را باز کنید! 🚀`;
    }

    let successCount = 0;

    for (const user of users) {
      try {
        await bot.sendMessage(user.telegramId, message, {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "🛍️ مشاهده پکیج‌ها",
                  web_app: { url: MINI_APP_URL },
                },
              ],
            ],
          },
        });
        successCount++;
        await new Promise((resolve) => setTimeout(resolve, 50));
      } catch (error) {
        console.error(
          `Failed to send discount notification to ${user.telegramId}`,
        );
      }
    }

    campaign.notificationSent = true;
    await campaign.save();

    console.log(
      `✅ Discount notification sent to ${successCount} users`,
    );
  } catch (error) {
    console.error("Error sending discount notification:", error);
  }
}

// تابع برای بروزرسانی آمار روزانه
async function updateDailyAnalytics(type, increment = 1) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let analytics = await Analytics.findOne({ date: today });

    if (!analytics) {
      analytics = new Analytics({ date: today });
    }

    switch (type) {
      case "miniAppVisit":
        analytics.miniAppVisits += increment;
        break;
      case "newUser":
        analytics.newUsers += increment;
        break;
      case "userMessage":
        analytics.userMessages += increment;
        analytics.totalMessages += increment;
        break;
      case "aiMessage":
        analytics.aiMessages += increment;
        analytics.totalMessages += increment;
        break;
      case "adminMessage":
        analytics.adminMessages += increment;
        analytics.totalMessages += increment;
        break;
      case "activeUser":
        analytics.activeUsers = increment;
        break;
      case "commandStart":
        analytics.botCommands.start += 1;
        break;
      case "commandHelp":
        analytics.botCommands.help += 1;
        break;
      case "commandServices":
        analytics.botCommands.services += 1;
        break;
      case "commandContact":
        analytics.botCommands.contact += 1;
        break;
    }

    await analytics.save();
  } catch (error) {
    console.error("Error updating analytics:", error);
  }
}

// تابع برای محاسبه تعداد کاربران فعال امروز
async function updateActiveUsersCount() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const activeCount = await User.countDocuments({
      lastActivity: { $gte: today },
    });

    await updateDailyAnalytics("activeUser", activeCount);
  } catch (error) {
    console.error("Error updating active users count:", error);
  }
}

// Middleware برای چک کردن ادمین
function isAdmin(req, res, next) {
  const { adminTelegramId } = req.body;

  if (!adminTelegramId) {
    return res.status(401).json({
      success: false,
      message: "Admin authentication required",
    });
  }

  if (!ADMIN_TELEGRAM_IDS.includes(adminTelegramId.toString())) {
    return res.status(403).json({
      success: false,
      message: "Access denied. Admin privileges required.",
    });
  }

  next();
}

// ==================== TELEGRAM BOT HANDLERS ====================

if (bot) {
  const WELCOME_MESSAGE = `
🌟 به ربات رسمی آراکس گروپ خوش آمدید! 🇦🇲

ما در زمینه ارائه خدمات اقامت و مهاجرت به ارمنستان فعالیت می‌کنیم.

📱 برای دسترسی به تمام خدمات ما، مینی اپ را باز کنید
💬 یا می‌توانید مستقیماً با پشتیبانی ما در ارتباط باشید

خدمات ما:
✅ دریافت کارت اقامت
🏠 پیداکردن خانه برای اجاره
🏨 رزرو هتل و سوییت
✈️ ترانسفر فرودگاهی
💱 صرافی و اکسچنج
🎓 ثبت نام دانشگاه و مدارس
📅 اخذ وقت سفارت

لطفاً یکی از گزینه‌های زیر را انتخاب کنید:
`;

  const getWelcomeKeyboard = () => {
    return {
      inline_keyboard: [
        [
          {
            text: "🚀 باز کردن مینی اپ",
            web_app: { url: MINI_APP_URL },
          },
        ],
        [
          {
            text: "💬 ارتباط با پشتیبانی",
            url: `https://t.me/${SUPPORT_USERNAME}`,
          },
        ],
        [
          {
            text: "📞 تماس تلفنی",
            callback_data: "contact_phone",
          },
          {
            text: "📧 ایمیل",
            callback_data: "contact_email",
          },
        ],
      ],
    };
  };

  async function registerUserFromBot(userData) {
    try {
      const fullName =
        `${userData.first_name || ""} ${userData.last_name || ""}`.trim();

      let user = await User.findOne({
        telegramId: userData.id.toString(),
      });

      let isNewUser = false;

      if (user) {
        user.userName = userData.username || user.userName;
        user.fullName = fullName || user.fullName;
        user.lastActivity = new Date();
        await user.save();
        console.log(`✅ User ${userData.id} updated from bot`);
      } else {
        user = new User({
          telegramId: userData.id.toString(),
          userName: userData.username || "",
          fullName: fullName || "",
          imageUrl: "",
          chat: [],
          lastActivity: new Date(),
        });
        await user.save();
        console.log(`✅ New user ${userData.id} created from bot`);
        isNewUser = true;
        await updateDailyAnalytics("newUser");
      }

      return { user, isNewUser };
    } catch (error) {
      console.error(
        "❌ Error registering user from bot:",
        error.message,
      );
      return null;
    }
  }

  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const user = msg.from;

    console.log(`📩 /start command received from user ${user.id}`);

    await registerUserFromBot(user);
    await updateDailyAnalytics("commandStart");
    await updateActiveUsersCount();

    try {
      await bot.sendMessage(chatId, WELCOME_MESSAGE, {
        reply_markup: getWelcomeKeyboard(),
        parse_mode: "Markdown",
      });
    } catch (error) {
      console.error(
        "❌ Error sending welcome message:",
        error.message,
      );
    }
  });

  bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;

    await updateDailyAnalytics("commandHelp");
    await updateActiveUsersCount();

    const helpMessage = `
📚 راهنمای استفاده از ربات:

/start - شروع مجدد ربات
/help - نمایش این راهنما
/services - لیست خدمات ما
/contact - اطلاعات تماس

🔹 برای استفاده از مینی اپ، روی دکمه "باز کردن مینی اپ" کلیک کنید.
🔹 برای ارتباط مستقیم با پشتیبانی، روی دکمه "ارتباط با پشتیبانی" کلیک کنید.

در صورت نیاز به کمک، با پشتیبانی ما تماس بگیرید.
    `;

    await bot.sendMessage(chatId, helpMessage, {
      reply_markup: getWelcomeKeyboard(),
    });
  });

  bot.onText(/\/services/, async (msg) => {
    const chatId = msg.chat.id;

    await updateDailyAnalytics("commandServices");
    await updateActiveUsersCount();

    const servicesMessage = `
🎯 خدمات آراکس گروپ:

1️⃣ دریافت کارت اقامت
   • اقامت کاری
   • اقامت تحصیلی
   • اقامت خانوادگی
   • اقامت سرمایه‌گذاری

2️⃣ پیداکردن خانه برای اجاره
   • مشاوره رایگان
   • بازدید از خانه‌ها
   • تنظیم قرارداد

3️⃣ رزرو هتل و سوییت روزانه
   • بهترین قیمت‌ها
   • تایید آنی

4️⃣ ترانسفر فرودگاهی
   • راننده مجرب
   • خودروهای مدل بالا

5️⃣ صرافی و اکسچنج
   • بهترین نرخ روز
   • تراکنش سریع و امن

6️⃣ ثبت نام دانشگاه و مدارس
   • راهنمایی کامل
   • پیگیری پذیرش

7️⃣ اخذ وقت سفارت
   • دریافت سریع وقت
   • مشاوره مدارک

برای اطلاعات بیشتر، مینی اپ را باز کنید یا با پشتیبانی تماس بگیرید.
    `;

    await bot.sendMessage(chatId, servicesMessage, {
      reply_markup: getWelcomeKeyboard(),
    });
  });

  bot.onText(/\/contact/, async (msg) => {
    const chatId = msg.chat.id;

    await updateDailyAnalytics("commandContact");
    await updateActiveUsersCount();

    const contactMessage = `
📞 اطلاعات تماس:

📱 تلگرام: @${SUPPORT_USERNAME}
📧 ایمیل: info@araksgroup.com
☎️ تلفن: +374 12 345 6789

📍 آدرس دفتر:
Fuchik 32/2, Yerevan, Armenia

🕐 ساعات کاری:
دوشنبه تا شنبه
10:00 صبح - 6:00 عصر (به وقت ایروان)

برای ارتباط سریع‌تر، از دکمه‌های زیر استفاده کنید:
    `;

    await bot.sendMessage(chatId, contactMessage, {
      reply_markup: getWelcomeKeyboard(),
    });
  });

  bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (text && !text.startsWith("/")) {
      console.log(
        `📩 Message received from user ${msg.from.id}: ${text}`,
      );

      await registerUserFromBot(msg.from);
      await updateActiveUsersCount();

      const responseMessage = `
دوست عزیز، از تماس شما با آراکس گروپ متشکریم! 🙏

برای دریافت بهترین خدمات، لطفاً از یکی از گزینه‌های زیر استفاده کنید:

🚀 مینی اپ ما را باز کنید تا به تمام خدمات دسترسی داشته باشید
💬 یا مستقیماً با پشتیبانی ما گفتگو کنید

ما آماده‌ایم تا در هر مرحله از مهاجرت به ارمنستان همراه شما باشیم! 🇦🇲
      `;

      await bot.sendMessage(chatId, responseMessage, {
        reply_markup: getWelcomeKeyboard(),
      });
    }
  });

  bot.on("callback_query", async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    console.log(
      `🔘 Callback received: ${data} from user ${callbackQuery.from.id}`,
    );

    switch (data) {
      case "contact_phone":
        await bot.answerCallbackQuery(callbackQuery.id);
        await bot.sendMessage(
          chatId,
          `📞 تماس تلفنی:\n\n+374 12 345 6789\n\nپاسخگویی 24/7\n\nبرای تماس، می‌توانید از تلگرام یا تماس مستقیم استفاده کنید.`,
        );
        break;

      case "contact_email":
        await bot.answerCallbackQuery(callbackQuery.id);
        await bot.sendMessage(
          chatId,
          `📧 ایمیل:\n\ninfo@araksgroup.com\n\nپاسخ طی 24 ساعت\n\nلطفاً سوالات خود را به صورت کامل ارسال کنید تا بهترین راهنمایی را دریافت کنید.`,
        );
        break;

      default:
        await bot.answerCallbackQuery(callbackQuery.id, {
          text: "گزینه نامعتبر!",
        });
    }
  });

  bot.on("polling_error", (error) => {
    console.error("❌ Bot polling error:", error.message);
  });

  bot.on("error", (error) => {
    console.error("❌ Bot error:", error.message);
  });
}

// ==================== API ROUTES ====================

app.get("/", (req, res) => {
  res.json({
    message: "Telegram Chat Bot API is running!",
    status: "OK",
    botStatus: bot ? "Active" : "Disabled",
    timestamp: new Date().toISOString(),
  });
});

app.post("/api/checkUser", async (req, res) => {
  try {
    const { telegramId, firstName, lastName, username, photoUrl } =
      req.body;

    if (!telegramId) {
      return res.status(400).json({
        success: false,
        message: "telegramId is required",
      });
    }

    const fullName = `${firstName || ""} ${lastName || ""}`.trim();

    let user = await User.findOne({
      telegramId: telegramId.toString(),
    });

    let isNewUser = false;

    if (user) {
      user.userName = username || user.userName;
      user.fullName = fullName || user.fullName;
      user.imageUrl = photoUrl || user.imageUrl;
      user.lastActivity = new Date();
      await user.save();

      return res.status(200).json({
        success: true,
        message: "User updated successfully",
        user: {
          telegramId: user.telegramId,
          userName: user.userName,
          fullName: user.fullName,
          imageUrl: user.imageUrl,
          messageCount: user.chat.length,
        },
        isNewUser: false,
      });
    } else {
      user = new User({
        telegramId: telegramId.toString(),
        userName: username || "",
        fullName: fullName || "",
        imageUrl: photoUrl || "",
        chat: [],
        lastActivity: new Date(),
      });
      await user.save();
      isNewUser = true;

      await updateDailyAnalytics("newUser");
      await updateDailyAnalytics("miniAppVisit");

      return res.status(201).json({
        success: true,
        message: "New user created successfully",
        user: {
          telegramId: user.telegramId,
          userName: user.userName,
          fullName: user.fullName,
          imageUrl: user.imageUrl,
          messageCount: 0,
        },
        isNewUser: true,
      });
    }
  } catch (error) {
    console.error("Error in checkUser:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

app.post("/api/trackVisit", async (req, res) => {
  try {
    const { telegramId } = req.body;

    if (telegramId) {
      await User.findOneAndUpdate(
        { telegramId: telegramId.toString() },
        { lastActivity: new Date() },
      );
    }

    await updateDailyAnalytics("miniAppVisit");
    await updateActiveUsersCount();

    return res.status(200).json({
      success: true,
      message: "Visit tracked successfully",
    });
  } catch (error) {
    console.error("Error in trackVisit:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

app.get("/api/messages", async (req, res) => {
  try {
    const { telegramId } = req.query;

    if (!telegramId) {
      return res.status(400).json({
        success: false,
        message: "telegramId is required",
      });
    }

    const user = await User.findOne({
      telegramId: telegramId.toString(),
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const formattedMessages = user.chat.map((msg) => ({
      id: msg._id.toString(),
      text: msg.message,
      sender: msg.from,
      time: new Date(msg.time).toLocaleTimeString("fa-IR", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      timestamp: msg.time,
    }));

    return res.status(200).json(formattedMessages);
  } catch (error) {
    console.error("Error in getMessages:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

app.post("/api/messages", async (req, res) => {
  try {
    const { telegramId, text, sender } = req.body;

    if (!telegramId || !text || !sender) {
      return res.status(400).json({
        success: false,
        message: "telegramId, text, and sender are required",
      });
    }

    let user = await User.findOne({
      telegramId: telegramId.toString(),
    });

    if (!user) {
      user = new User({
        telegramId: telegramId.toString(),
        chat: [],
      });
    }

    const userMessage = {
      message: text,
      time: new Date(),
      from: "user",
    };
    user.chat.push(userMessage);
    user.lastActivity = new Date();
    await user.save();

    await updateDailyAnalytics("userMessage");
    await updateActiveUsersCount();

    res.status(201).json({
      success: true,
      message: "Message sent successfully",
      messageId: user.chat[user.chat.length - 1]._id.toString(),
    });

    processAIResponse(telegramId.toString(), text, user.chat);
  } catch (error) {
    console.error("Error in sendMessage:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

async function processAIResponse(
  telegramId,
  userMessage,
  chatHistory,
) {
  try {
    const messages = [
      {
        role: "system",
        content: `تو یک دستیار هوشمند و مفید هستی که به زبان فارسی پاسخ می‌دهی. وظیفه‌ات کمک به کاربران در مورد خدمات اقامتی و مهاجرتی است. پاسخ‌هایت باید مودبانه، دقیق و مفید باشند. همیشه سعی کن به سوالات کاربر به بهترین شکل پاسخ دهی و در صورت نیاز اطلاعات بیشتری درخواست کن.`,
      },
    ];

    const recentChat = chatHistory.slice(-10);
    recentChat.forEach((msg) => {
      messages.push({
        role: msg.from === "user" ? "user" : "assistant",
        content: msg.message,
      });
    });

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: messages,
      temperature: 0.7,
      max_tokens: 500,
    });

    const aiResponse = completion.choices[0].message.content;

    const user = await User.findOne({ telegramId });
    if (user) {
      user.chat.push({
        message: aiResponse,
        time: new Date(),
        from: "ai",
      });
      await user.save();
      await updateDailyAnalytics("aiMessage");
      console.log(`✅ AI response saved for user ${telegramId}`);
    }
  } catch (error) {
    console.error("Error in processAIResponse:", error);

    try {
      const user = await User.findOne({ telegramId });
      if (user) {
        user.chat.push({
          message:
            "متاسفم، در حال حاضر مشکلی پیش آمده است. لطفاً بعداً دوباره تلاش کنید یا با پشتیبانی تماس بگیرید.",
          time: new Date(),
          from: "ai",
        });
        await user.save();
        await updateDailyAnalytics("aiMessage");
      }
    } catch (saveError) {
      console.error("Error saving fallback message:", saveError);
    }
  }
}

app.delete("/api/messages", async (req, res) => {
  try {
    const { telegramId } = req.body;

    if (!telegramId) {
      return res.status(400).json({
        success: false,
        message: "telegramId is required",
      });
    }

    const user = await User.findOne({
      telegramId: telegramId.toString(),
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    user.chat = [];
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Chat history deleted successfully",
    });
  } catch (error) {
    console.error("Error in deleteMessages:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

app.get("/api/user/:telegramId", async (req, res) => {
  try {
    const { telegramId } = req.params;

    const user = await User.findOne({
      telegramId: telegramId.toString(),
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      user: {
        telegramId: user.telegramId,
        userName: user.userName,
        fullName: user.fullName,
        imageUrl: user.imageUrl,
        messageCount: user.chat.length,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastActivity: user.lastActivity,
        isActive: user.isActive,
      },
    });
  } catch (error) {
    console.error("Error in getUserInfo:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

// ==================== ADMIN PANEL ROUTES ====================

// دریافت لیست تمام کاربران
// app.post("/api/admin/users", isAdmin, async (req, res) => {
app.post("/api/admin/users", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = "",
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.body;

    const query = {};

    if (search) {
      query.$or = [
        { userName: { $regex: search, $options: "i" } },
        { fullName: { $regex: search, $options: "i" } },
        { telegramId: { $regex: search, $options: "i" } },
      ];
    }

    const sort = {};
    sort[sortBy] = sortOrder === "asc" ? 1 : -1;

    const users = await User.find(query)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit);

    const totalUsers = await User.countDocuments(query);

    const usersWithStats = users.map((user) => ({
      telegramId: user.telegramId,
      userName: user.userName,
      fullName: user.fullName,
      imageUrl: user.imageUrl,
      createdAt: user.createdAt,
      lastActivity: user.lastActivity,
      isActive: user.isActive,
      messageCount: user.chat ? user.chat.length : 0,
      chatLink: `https://t.me/${user.userName}`,
    }));

    return res.status(200).json({
      success: true,
      users: usersWithStats,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalUsers / limit),
        totalUsers,
        limit,
      },
    });
  } catch (error) {
    console.error("Error in admin/users:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

// دریافت جزئیات یک کاربر با چت
// app.post("/api/admin/user/:telegramId", isAdmin, async (req, res) => {
app.post("/api/admin/user/:telegramId", async (req, res) => {
  try {
    const { telegramId } = req.params;

    const user = await User.findOne({
      telegramId: telegramId.toString(),
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const formattedChat = user.chat.map((msg) => ({
      id: msg._id.toString(),
      message: msg.message,
      time: msg.time,
      from: msg.from,
    }));

    return res.status(200).json({
      success: true,
      user: {
        telegramId: user.telegramId,
        userName: user.userName,
        fullName: user.fullName,
        imageUrl: user.imageUrl,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastActivity: user.lastActivity,
        isActive: user.isActive,
        chat: formattedChat,
        chatLink: `https://t.me/${user.userName}`,
      },
    });
  } catch (error) {
    console.error("Error in admin/user details:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

// ارسال پیام به کاربر خاص
// app.post("/api/admin/sendMessage", isAdmin, async (req, res) => {
app.post("/api/admin/sendMessage", async (req, res) => {
  try {
    const { targetTelegramId, message, adminTelegramId } = req.body;

    if (!targetTelegramId || !message) {
      return res.status(400).json({
        success: false,
        message: "targetTelegramId and message are required",
      });
    }

    const user = await User.findOne({
      telegramId: targetTelegramId.toString(),
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (bot) {
      try {
        await bot.sendMessage(targetTelegramId, message);

        user.chat.push({
          message: message,
          time: new Date(),
          from: "admin",
        });
        await user.save();
        await updateDailyAnalytics("adminMessage");

        return res.status(200).json({
          success: true,
          message: "Message sent successfully",
        });
      } catch (botError) {
        console.error("Error sending message via bot:", botError);
        return res.status(500).json({
          success: false,
          message: "Failed to send message via Telegram",
          error: botError.message,
        });
      }
    } else {
      return res.status(503).json({
        success: false,
        message: "Bot is not active",
      });
    }
  } catch (error) {
    console.error("Error in admin/sendMessage:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

// ارسال پیام به همه کاربران (Broadcast)
// app.post("/api/admin/broadcast", isAdmin, async (req, res) => {
app.post("/api/admin/broadcast", async (req, res) => {
  try {
    const { message, adminTelegramId } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: "Message is required",
      });
    }

    if (!bot) {
      return res.status(503).json({
        success: false,
        message: "Bot is not active",
      });
    }

    const broadcast = new Broadcast({
      message,
      sentBy: adminTelegramId,
      status: "pending",
    });

    const users = await User.find({ isActive: true });
    broadcast.recipientsCount = users.length;
    await broadcast.save();

    res.status(202).json({
      success: true,
      message: "Broadcast started",
      broadcastId: broadcast._id.toString(),
      recipientsCount: users.length,
    });

    broadcast.status = "sending";
    await broadcast.save();

    let successCount = 0;
    let failureCount = 0;

    for (const user of users) {
      try {
        await bot.sendMessage(user.telegramId, message);

        user.chat.push({
          message: message,
          time: new Date(),
          from: "admin",
        });
        await user.save();

        successCount++;
        await updateDailyAnalytics("adminMessage");

        await new Promise((resolve) => setTimeout(resolve, 50));
      } catch (error) {
        console.error(
          `Failed to send message to user ${user.telegramId}:`,
          error.message,
        );
        failureCount++;
      }
    }

    broadcast.successCount = successCount;
    broadcast.failureCount = failureCount;
    broadcast.status = "completed";
    await broadcast.save();

    console.log(
      `✅ Broadcast completed: ${successCount} success, ${failureCount} failed`,
    );
  } catch (error) {
    console.error("Error in admin/broadcast:", error);
  }
});

// دریافت تاریخچه Broadcast
// app.post("/api/admin/broadcasts", isAdmin, async (req, res) => {
app.post("/api/admin/broadcasts", async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.body;

    const broadcasts = await Broadcast.find()
      .sort({ sentAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const totalBroadcasts = await Broadcast.countDocuments();

    return res.status(200).json({
      success: true,
      broadcasts,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalBroadcasts / limit),
        totalBroadcasts,
        limit,
      },
    });
  } catch (error) {
    console.error("Error in admin/broadcasts:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

// دریافت آمار داشبورد
// app.post(
//   "/api/admin/analytics/dashboard",
//   isAdmin,
app.post("/api/admin/analytics/dashboard", async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeUsersToday = await User.countDocuments({
      lastActivity: {
        $gte: new Date(new Date().setHours(0, 0, 0, 0)),
      },
    });

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const activeUsersWeek = await User.countDocuments({
      lastActivity: { $gte: weekAgo },
    });

    const monthAgo = new Date();
    monthAgo.setDate(monthAgo.getDate() - 30);
    const newUsersMonth = await User.countDocuments({
      createdAt: { $gte: monthAgo },
    });

    const allUsers = await User.find();
    let totalMessages = 0;
    let userMessages = 0;
    let aiMessages = 0;
    let adminMessages = 0;

    allUsers.forEach((user) => {
      if (user.chat && user.chat.length > 0) {
        totalMessages += user.chat.length;
        user.chat.forEach((msg) => {
          if (msg.from === "user") userMessages++;
          else if (msg.from === "ai") aiMessages++;
          else if (msg.from === "admin") adminMessages++;
        });
      }
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayAnalytics = await Analytics.findOne({ date: today });

    const last30Days = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      last30Days.push(date);
    }

    const dailyStats = await Analytics.find({
      date: { $in: last30Days },
    }).sort({ date: 1 });

    const chartData = last30Days.map((date) => {
      const stat = dailyStats.find(
        (s) => s.date.toDateString() === date.toDateString(),
      );
      return {
        date: date.toISOString().split("T")[0],
        newUsers: stat ? stat.newUsers : 0,
        miniAppVisits: stat ? stat.miniAppVisits : 0,
        totalMessages: stat ? stat.totalMessages : 0,
        activeUsers: stat ? stat.activeUsers : 0,
      };
    });

    return res.status(200).json({
      success: true,
      dashboard: {
        overview: {
          totalUsers,
          activeUsersToday,
          activeUsersWeek,
          newUsersMonth,
          totalMessages,
          userMessages,
          aiMessages,
          adminMessages,
        },
        today: {
          miniAppVisits: todayAnalytics
            ? todayAnalytics.miniAppVisits
            : 0,
          newUsers: todayAnalytics ? todayAnalytics.newUsers : 0,
          totalMessages: todayAnalytics
            ? todayAnalytics.totalMessages
            : 0,
          activeUsers: todayAnalytics
            ? todayAnalytics.activeUsers
            : 0,
          botCommands: todayAnalytics
            ? todayAnalytics.botCommands
            : {},
        },
        chartData,
      },
    });
  } catch (error) {
    console.error("Error in admin/analytics/dashboard:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

// دریافت آمار بر اساس بازه زمانی
// app.post("/api/admin/analytics/range", isAdmin, async (req, res) => {
app.post("/api/admin/analytics/range", async (req, res) => {
  try {
    const { startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "startDate and endDate are required",
      });
    }

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const analytics = await Analytics.find({
      date: { $gte: start, $lte: end },
    }).sort({ date: 1 });

    const summary = {
      totalMiniAppVisits: 0,
      totalNewUsers: 0,
      totalMessages: 0,
      totalUserMessages: 0,
      totalAiMessages: 0,
      totalAdminMessages: 0,
      averageActiveUsers: 0,
      totalBotCommands: {
        start: 0,
        help: 0,
        services: 0,
        contact: 0,
      },
    };

    analytics.forEach((day) => {
      summary.totalMiniAppVisits += day.miniAppVisits;
      summary.totalNewUsers += day.newUsers;
      summary.totalMessages += day.totalMessages;
      summary.totalUserMessages += day.userMessages;
      summary.totalAiMessages += day.aiMessages;
      summary.totalAdminMessages += day.adminMessages;
      summary.averageActiveUsers += day.activeUsers;
      summary.totalBotCommands.start += day.botCommands.start;
      summary.totalBotCommands.help += day.botCommands.help;
      summary.totalBotCommands.services += day.botCommands.services;
      summary.totalBotCommands.contact += day.botCommands.contact;
    });

    if (analytics.length > 0) {
      summary.averageActiveUsers = Math.round(
        summary.averageActiveUsers / analytics.length,
      );
    }

    return res.status(200).json({
      success: true,
      analytics,
      summary,
      period: {
        startDate: start,
        endDate: end,
        days: analytics.length,
      },
    });
  } catch (error) {
    console.error("Error in admin/analytics/range:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

// تغییر وضعیت فعال/غیرفعال کاربر
app.post(
  "/api/admin/user/toggle-status",
  // isAdmin,
  async (req, res) => {
    try {
      const { telegramId } = req.body;

      if (!telegramId) {
        return res.status(400).json({
          success: false,
          message: "telegramId is required",
        });
      }

      const user = await User.findOne({
        telegramId: telegramId.toString(),
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      user.isActive = !user.isActive;
      await user.save();

      return res.status(200).json({
        success: true,
        message: `User ${user.isActive ? "activated" : "deactivated"} successfully`,
        user: {
          telegramId: user.telegramId,
          isActive: user.isActive,
        },
      });
    } catch (error) {
      console.error("Error in admin/user/toggle-status:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  },
);

// دریافت آمار سیستم
// app.post("/api/admin/stats", isAdmin, async (req, res) => {
app.post("/api/admin/stats", async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: true });
    const inactiveUsers = totalUsers - activeUsers;

    const totalBroadcasts = await Broadcast.countDocuments();
    const completedBroadcasts = await Broadcast.countDocuments({
      status: "completed",
    });

    const totalAnalyticsDays = await Analytics.countDocuments();

    const analytics = await Analytics.find();
    let totalVisits = 0;
    analytics.forEach((day) => {
      totalVisits += day.miniAppVisits;
    });
    const averageDailyVisits =
      totalAnalyticsDays > 0
        ? Math.round(totalVisits / totalAnalyticsDays)
        : 0;

    return res.status(200).json({
      success: true,
      stats: {
        users: {
          total: totalUsers,
          active: activeUsers,
          inactive: inactiveUsers,
        },
        broadcasts: {
          total: totalBroadcasts,
          completed: completedBroadcasts,
        },
        analytics: {
          totalDaysTracked: totalAnalyticsDays,
          totalVisits,
          averageDailyVisits,
        },
        system: {
          botStatus: bot ? "Active" : "Disabled",
          databaseStatus:
            mongoose.connection.readyState === 1
              ? "Connected"
              : "Disconnected",
          uptime: process.uptime(),
        },
      },
    });
  } catch (error) {
    console.error("Error in admin/stats:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

// جستجوی کاربران
// app.post("/api/admin/search", isAdmin, async (req, res) => {
app.post("/api/admin/search", async (req, res) => {
  try {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({
        success: false,
        message: "Search query is required",
      });
    }

    const users = await User.find({
      $or: [
        { userName: { $regex: query, $options: "i" } },
        { fullName: { $regex: query, $options: "i" } },
        { telegramId: { $regex: query, $options: "i" } },
      ],
    }).limit(20);

    return res.status(200).json({
      success: true,
      users: users.map((user) => ({
        telegramId: user.telegramId,
        userName: user.userName,
        fullName: user.fullName,
        imageUrl: user.imageUrl,
        createdAt: user.createdAt,
        lastActivity: user.lastActivity,
        isActive: user.isActive,
        messageCount: user.chat ? user.chat.length : 0,
      })),
    });
  } catch (error) {
    console.error("Error in admin/search:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

// Export کاربران
// app.post("/api/admin/export/users", isAdmin, async (req, res) => {
app.post("/api/admin/export/users", async (req, res) => {
  try {
    const users = await User.find();

    const csvData = users.map((user) => ({
      telegramId: user.telegramId,
      userName: user.userName,
      fullName: user.fullName,
      createdAt: user.createdAt.toISOString(),
      lastActivity: user.lastActivity.toISOString(),
      isActive: user.isActive,
      messageCount: user.chat ? user.chat.length : 0,
    }));

    return res.status(200).json({
      success: true,
      users: csvData,
      totalUsers: csvData.length,
    });
  } catch (error) {
    console.error("Error in admin/export/users:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

// بعد از app.get("/api/user/:telegramId", ...) اضافه کن:

// ==================== PACKAGES API ROUTES ====================

// دریافت لیست تمام پکیج‌های فعال
app.get("/api/packages", async (req, res) => {
  try {
    const packages = await Package.find({ isActive: true }).sort({
      order: 1,
      createdAt: -1,
    });

    // محاسبه تخفیف برای هر پکیج
    const packagesWithDiscount = await Promise.all(
      packages.map(async (pkg) => {
        const discount = await calculateDiscountedPrice(
          pkg._id,
          pkg.price,
        );

        return {
          id: pkg._id.toString(),
          title: pkg.title,
          titleEn: pkg.titleEn,
          duration: pkg.duration,
          price: pkg.price,
          priceText: pkg.priceText,
          description: pkg.description,
          icon: pkg.icon,
          features: pkg.features,
          popular: pkg.popular,
          gradient: pkg.gradient,
          longDescription: pkg.longDescription,
          benefits: pkg.benefits,
          requirements: pkg.requirements,
          process: pkg.process,
          contactRequired: pkg.contactRequired,
          ...discount,
        };
      }),
    );

    return res.status(200).json({
      success: true,
      packages: packagesWithDiscount,
    });
  } catch (error) {
    console.error("Error in get packages:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

// دریافت جزئیات یک پکیج
app.get("/api/packages/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const pkg = await Package.findById(id);

    if (!pkg) {
      return res.status(404).json({
        success: false,
        message: "Package not found",
      });
    }

    const discount = await calculateDiscountedPrice(
      pkg._id,
      pkg.price,
    );

    return res.status(200).json({
      success: true,
      package: {
        id: pkg._id.toString(),
        title: pkg.title,
        titleEn: pkg.titleEn,
        duration: pkg.duration,
        price: pkg.price,
        priceText: pkg.priceText,
        description: pkg.description,
        icon: pkg.icon,
        features: pkg.features,
        popular: pkg.popular,
        gradient: pkg.gradient,
        longDescription: pkg.longDescription,
        benefits: pkg.benefits,
        requirements: pkg.requirements,
        process: pkg.process,
        contactRequired: pkg.contactRequired,
        ...discount,
      },
    });
  } catch (error) {
    console.error("Error in get package:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

// بعد از app.post("/api/admin/export/users", ...) اضافه کن:

// ==================== ADMIN PACKAGES ROUTES ====================

// دریافت لیست تمام پکیج‌ها (برای ادمین)
app.post("/api/admin/packages", async (req, res) => {
  try {
    const packages = await Package.find().sort({
      order: 1,
      createdAt: -1,
    });

    return res.status(200).json({
      success: true,
      packages: packages.map((pkg) => ({
        id: pkg._id.toString(),
        title: pkg.title,
        titleEn: pkg.titleEn,
        duration: pkg.duration,
        price: pkg.price,
        priceText: pkg.priceText,
        description: pkg.description,
        icon: pkg.icon,
        features: pkg.features || [],
        popular: pkg.popular,
        gradient: pkg.gradient,
        // ✅ اضافه کردن فیلدهای گمشده
        longDescription: pkg.longDescription || "",
        benefits: pkg.benefits || [],
        requirements: pkg.requirements || [],
        process: pkg.process || [],
        contactRequired: pkg.contactRequired || false,
        isActive: pkg.isActive,
        order: pkg.order,
        createdAt: pkg.createdAt,
        updatedAt: pkg.updatedAt,
      })),
    });
  } catch (error) {
    console.error("Error in admin/packages:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

// ایجاد پکیج جدید
app.post("/api/admin/packages/create", async (req, res) => {
  try {
    const packageData = req.body.packageData;

    const newPackage = new Package({
      ...packageData,
      updatedAt: new Date(),
    });

    await newPackage.save();

    return res.status(201).json({
      success: true,
      message: "Package created successfully",
      package: newPackage,
    });
  } catch (error) {
    console.error("Error in create package:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

// ویرایش پکیج
app.post("/api/admin/packages/update/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const packageData = req.body.packageData;

    console.log({ id });
    console.log({ packageData });

    const pkg = await Package.findByIdAndUpdate(
      id,
      {
        ...packageData,
        updatedAt: new Date(),
      },
      { new: true },
    );

    console.log({ pkg });

    if (!pkg) {
      return res.status(404).json({
        success: false,
        message: "Package not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Package updated successfully",
      package: pkg,
    });
  } catch (error) {
    console.error("Error in update package:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

// حذف پکیج
app.delete("/api/admin/packages/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const pkg = await Package.findByIdAndDelete(id);

    if (!pkg) {
      return res.status(404).json({
        success: false,
        message: "Package not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Package deleted successfully",
    });
  } catch (error) {
    console.error("Error in delete package:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

// تغییر وضعیت فعال/غیرفعال پکیج
app.post("/api/admin/packages/toggle/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const pkg = await Package.findById(id);

    if (!pkg) {
      return res.status(404).json({
        success: false,
        message: "Package not found",
      });
    }

    pkg.isActive = !pkg.isActive;
    pkg.updatedAt = new Date();
    await pkg.save();

    return res.status(200).json({
      success: true,
      message: `Package ${pkg.isActive ? "activated" : "deactivated"} successfully`,
      package: pkg,
    });
  } catch (error) {
    console.error("Error in toggle package:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

// ==================== ADMIN DISCOUNT CAMPAIGNS ROUTES ====================

// دریافت لیست تمام کمپین‌ها
app.post("/api/admin/campaigns", async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.body;

    const campaigns = await DiscountCampaign.find()
      .populate("packages", "title price")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const totalCampaigns = await DiscountCampaign.countDocuments();

    const now = new Date();
    const campaignsWithStatus = campaigns.map((campaign) => {
      let status = "upcoming";
      if (now >= campaign.startDate && now <= campaign.endDate) {
        status = campaign.isActive ? "active" : "paused";
      } else if (now > campaign.endDate) {
        status = "expired";
      }

      return {
        id: campaign._id.toString(),
        name: campaign.name,
        description: campaign.description,
        discountType: campaign.discountType,
        discountValue: campaign.discountValue,
        packages: campaign.packages,
        startDate: campaign.startDate,
        endDate: campaign.endDate,
        isActive: campaign.isActive,
        notificationSent: campaign.notificationSent,
        createdAt: campaign.createdAt,
        status,
      };
    });

    return res.status(200).json({
      success: true,
      campaigns: campaignsWithStatus,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCampaigns / limit),
        totalCampaigns,
        limit,
      },
    });
  } catch (error) {
    console.error("Error in admin/campaigns:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

// ایجاد کمپین تخفیف جدید
app.post("/api/admin/campaigns/create", async (req, res) => {
  try {
    const { campaignData, adminTelegramId, sendNotification } =
      req.body;

    const newCampaign = new DiscountCampaign({
      ...campaignData,
      createdBy: adminTelegramId || "",
    });

    await newCampaign.save();

    // ارسال نوتیفیکیشن به کاربران (اختیاری)
    if (
      sendNotification &&
      new Date(campaignData.startDate) <= new Date()
    ) {
      setTimeout(() => {
        sendDiscountNotification(newCampaign._id);
      }, 1000);
    }

    return res.status(201).json({
      success: true,
      message: "Campaign created successfully",
      campaign: newCampaign,
    });
  } catch (error) {
    console.error("Error in create campaign:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

// ویرایش کمپین
app.post("/api/admin/campaigns/update/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { campaignData } = req.body;

    const campaign = await DiscountCampaign.findByIdAndUpdate(
      id,
      campaignData,
      { new: true },
    );

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Campaign updated successfully",
      campaign,
    });
  } catch (error) {
    console.error("Error in update campaign:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

// حذف کمپین
app.delete("/api/admin/campaigns/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const campaign = await DiscountCampaign.findByIdAndDelete(id);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Campaign deleted successfully",
    });
  } catch (error) {
    console.error("Error in delete campaign:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

// فعال/غیرفعال کردن کمپین
app.post("/api/admin/campaigns/toggle/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const campaign = await DiscountCampaign.findById(id);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found",
      });
    }

    campaign.isActive = !campaign.isActive;
    await campaign.save();

    return res.status(200).json({
      success: true,
      message: `Campaign ${campaign.isActive ? "activated" : "deactivated"} successfully`,
      campaign,
    });
  } catch (error) {
    console.error("Error in toggle campaign:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

// ارسال مجدد نوتیفیکیشن کمپین
app.post(
  "/api/admin/campaigns/resend-notification/:id",
  async (req, res) => {
    try {
      const { id } = req.params;

      const campaign = await DiscountCampaign.findById(id);

      if (!campaign) {
        return res.status(404).json({
          success: false,
          message: "Campaign not found",
        });
      }

      // Reset notification flag
      campaign.notificationSent = false;
      await campaign.save();

      // Send notification
      setTimeout(() => {
        sendDiscountNotification(id);
      }, 500);

      return res.status(200).json({
        success: true,
        message: "Notification will be sent shortly",
      });
    } catch (error) {
      console.error("Error in resend notification:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  },
);

// قبل از app.listen() اضافه کن:

// ==================== INITIAL DATA MIGRATION ====================

async function initializePackages() {
  try {
    const count = await Package.countDocuments();

    if (count === 0) {
      console.log("📦 Initializing packages...");

      const initialPackages = [
        {
          title: "اقامت از طریق ثبت شرکت",
          titleEn: "Residence through Company Registration",
          duration: "1 ساله",
          price: 900,
          description:
            "دریافت اقامت یک ساله از طریق ثبت شرکت در ارمنستان",
          icon: "Building2",
          features: [
            "ثبت شرکت رسمی",
            "اقامت 1 ساله",
            "افتتاح حساب بانکی",
            "پشتیبانی کامل",
          ],
          popular: false,
          gradient: "from-emerald-500 to-teal-500",
          order: 1,
        },
        {
          title: "اقامت 5 ساله",
          titleEn: "5-Year Residence",
          duration: "5 ساله",
          price: 1500,
          description: "اقامت بلند مدت با امکانات ویژه",
          icon: "Building2",
          features: [
            "اقامت 5 ساله",
            "قابل تمدید",
            "حساب بانکی رایگان",
            "مشاوره حقوقی",
          ],
          popular: true,
          gradient: "from-indigo-500 to-purple-500",
          order: 2,
        },
        {
          title: "اقامت تحصیلی",
          titleEn: "Student Residence",
          duration: "تحصیلی",
          price: 800,
          description: "برای دانشجویان و محققین",
          icon: "GraduationCap",
          features: [
            "پذیرش تحصیلی",
            "اقامت دانشجویی",
            "تخفیف ویژه",
            "پشتیبانی آموزشی",
          ],
          popular: false,
          gradient: "from-cyan-500 to-blue-500",
          order: 3,
        },
      ];

      await Package.insertMany(initialPackages);
      console.log("✅ Initial packages created");
    }
  } catch (error) {
    console.error("Error initializing packages:", error);
  }
}

// فراخوانی تابع
// initializePackages();

// ==================== ERROR HANDLERS ====================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(500).json({
    success: false,
    message: "Internal server error",
    error: err.message,
  });
});

// ==================== PROCESS HANDLERS ====================

process.on("SIGINT", () => {
  console.log("\n🛑 Server is shutting down...");
  if (bot) {
    bot.stopPolling();
  }
  mongoose.connection.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n🛑 Server is shutting down...");
  if (bot) {
    bot.stopPolling();
  }
  mongoose.connection.close();
  process.exit(0);
});

// ==================== START SERVER ====================

app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/`);
  if (bot) {
    console.log(
      `✅ Telegram Bot is active and listening for messages!`,
    );
  }
  console.log(`👑 Admin Panel routes are ready!`);
});
