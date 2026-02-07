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

const Analytics = mongoose.model("Analytics", analyticsSchema);

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

const Broadcast = mongoose.model("Broadcast", broadcastSchema);

// ==================== HELPER FUNCTIONS ====================

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
app.post("/api/admin/users", isAdmin, async (req, res) => {
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
app.post("/api/admin/user/:telegramId", isAdmin, async (req, res) => {
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
app.post("/api/admin/sendMessage", isAdmin, async (req, res) => {
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
app.post("/api/admin/broadcast", isAdmin, async (req, res) => {
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
app.post("/api/admin/broadcasts", isAdmin, async (req, res) => {
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
app.post(
  "/api/admin/analytics/dashboard",
  isAdmin,
  async (req, res) => {
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
  },
);

// دریافت آمار بر اساس بازه زمانی
app.post("/api/admin/analytics/range", isAdmin, async (req, res) => {
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
  isAdmin,
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
app.post("/api/admin/stats", isAdmin, async (req, res) => {
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
app.post("/api/admin/search", isAdmin, async (req, res) => {
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
app.post("/api/admin/export/users", isAdmin, async (req, res) => {
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
