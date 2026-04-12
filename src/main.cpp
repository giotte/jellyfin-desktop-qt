#include <cstdio>
#include <cstdlib>
#include <cstring>

#include <QApplication>
#include <QCommandLineOption>
#include <QCommandLineParser>
#include <QCoreApplication>
#include <QFile>
#include <QFontDatabase>
#include <QIcon>
#include <QQmlApplicationEngine>
#include <QSysInfo>
#include <QVariant>
#include <QWebChannel>

#include <QtWebEngine/qtwebengineglobal.h>

#include "shared/Names.h"
#include "system/SystemComponent.h"
#include "Paths.h"
#include "player/CodecsComponent.h"
#include "player/PlayerComponent.h"
#include "player/OpenGLDetect.h"
#include "Version.h"
#include "settings/SettingsComponent.h"
#include "settings/SettingsSection.h"
#include "ui/KonvergoWindow.h"
#include "Globals.h"
#include "ui/ErrorMessage.h"
#include "UniqueApplication.h"
#include "utils/Log.h"

#ifdef Q_OS_MAC
#include "PFMoveApplication.h"
#endif

#if defined(Q_OS_MAC) || defined(Q_OS_LINUX) || defined(Q_OS_FREEBSD)
#include "SignalManager.h"
#endif

/////////////////////////////////////////////////////////////////////////////////////////
static void preinitQt()
{
    QCoreApplication::setApplicationName(Names::MainName());
    QCoreApplication::setApplicationVersion(Version::GetVersionString());
    QCoreApplication::setOrganizationDomain("jellyfin.org");

#ifdef Q_OS_WIN32
    QVariant useOpengl = SettingsComponent::readPreinitValue(SETTINGS_SECTION_MAIN, "useOpenGL");

    // Warning: this must be the same as the default value as declared in
    // the settings_description.json file, or confusion will result.
    if (useOpengl.type() != QMetaType::Bool)
        useOpengl = false;

    if (useOpengl.toBool())
        QCoreApplication::setAttribute(Qt::AA_UseDesktopOpenGL);
    else
        QCoreApplication::setAttribute(Qt::AA_UseOpenGLES);
#endif
}

/////////////////////////////////////////////////////////////////////////////////////////
static bool isWindows81OrOlder()
{
#ifdef Q_OS_WIN
    return QSysInfo::windowsVersion() <= QSysInfo::WV_WINDOWS8_1;
#else
    return false;
#endif
}

/////////////////////////////////////////////////////////////////////////////////////////
static QString windowsVersionName()
{
#ifdef Q_OS_WIN
    switch (QSysInfo::windowsVersion())
    {
    case QSysInfo::WV_32s: return QStringLiteral("WV_32s");
    case QSysInfo::WV_95: return QStringLiteral("WV_95");
    case QSysInfo::WV_98: return QStringLiteral("WV_98");
    case QSysInfo::WV_Me: return QStringLiteral("WV_Me");
    case QSysInfo::WV_DOS_based: return QStringLiteral("WV_DOS_based");
    case QSysInfo::WV_NT: return QStringLiteral("WV_NT");
    case QSysInfo::WV_2000: return QStringLiteral("WV_2000");
    case QSysInfo::WV_XP: return QStringLiteral("WV_XP");
    case QSysInfo::WV_2003: return QStringLiteral("WV_2003");
    case QSysInfo::WV_VISTA: return QStringLiteral("WV_VISTA");
    case QSysInfo::WV_WINDOWS7: return QStringLiteral("WV_WINDOWS7");
    case QSysInfo::WV_WINDOWS8: return QStringLiteral("WV_WINDOWS8");
    case QSysInfo::WV_WINDOWS8_1: return QStringLiteral("WV_WINDOWS8_1");
    case QSysInfo::WV_WINDOWS10: return QStringLiteral("WV_WINDOWS10+");
    default: return QStringLiteral("WV_Unknown");
    }
#else
    return QStringLiteral("non-windows");
#endif
}

/////////////////////////////////////////////////////////////////////////////////////////
static QString registerMaterialIconsFont()
{
    const QString fontPath = QStringLiteral(":/fonts/MaterialIcons-Regular.ttf");
    const int id = QFontDatabase::addApplicationFont(fontPath);

    if (id < 0)
    {
        qWarning() << "[win81-icons] Failed to register bundled Material Icons font from" << fontPath;
        return QStringLiteral("Material Icons");
    }

    const QStringList families = QFontDatabase::applicationFontFamilies(id);
    qDebug() << "[win81-icons] addApplicationFont ok id=" << id << "families=" << families;

    if (families.isEmpty())
        return QStringLiteral("Material Icons");

    return families.first();
}

/////////////////////////////////////////////////////////////////////////////////////////
char** appendCommandLineArguments(int argc, char **argv, const QStringList& args)
{
    size_t newSize = (argc + args.length() + 1) * sizeof(char*);
    char** newArgv = (char**)calloc(1, newSize);
    memcpy(newArgv, argv, (size_t)(argc * sizeof(char*)));

    int pos = argc;
    for (const QString& str : args)
        newArgv[pos++] = qstrdup(str.toUtf8().data());

    return newArgv;
}

/////////////////////////////////////////////////////////////////////////////////////////
void ShowLicenseInfo()
{
    QFile licenses(":/misc/licenses.txt");
    licenses.open(QIODevice::ReadOnly | QIODevice::Text);
    QByteArray contents = licenses.readAll();
    printf("%.*s\n", contents.size(), contents.data());
}

/////////////////////////////////////////////////////////////////////////////////////////
QStringList g_qtFlags = {
    "--disable-web-security",
    //"--enable-gpu-rasterization",
#ifdef Q_OS_LINUX
    "--disable-gpu"
#endif
};

/////////////////////////////////////////////////////////////////////////////////////////
int main(int argc, char *argv[])
{
    try
    {
#ifdef Q_OS_WIN
        qDebug() << "[win81-icons] detected windowsVersion="
                 << windowsVersionName()
                 << "numeric=" << QSysInfo::windowsVersion();

        if (isWindows81OrOlder())
        {
            qputenv("QTWEBENGINE_CHROMIUM_FLAGS",
                    "--disable-gpu --disable-gpu-compositing --disable-direct-composition");
            qDebug() << "[win81-icons] compatibility branch enabled";
            qDebug() << "[win81-icons] QTWEBENGINE_CHROMIUM_FLAGS="
                     << qgetenv("QTWEBENGINE_CHROMIUM_FLAGS");
        }
        else
        {
            qunsetenv("QTWEBENGINE_CHROMIUM_FLAGS");
            qDebug() << "[win81-icons] compatibility branch disabled";
        }
#endif

        QCommandLineParser parser;
        parser.setApplicationDescription("Jellyfin Media Player");
        parser.addHelpOption();
        parser.addVersionOption();
        parser.addOptions({
            {{"l", "licenses"}, "Show license information"},
            {"desktop", "Start in desktop mode"},
            {"tv", "Start in TV mode"},
            {"windowed", "Start in windowed mode"},
            {"fullscreen", "Start in fullscreen"},
            {"terminal", "Log to terminal"},
            {"disable-gpu", "Disable QtWebEngine gpu accel"},
            {"force-external-webclient", "Use webclient provided by server"}
        });

        auto scaleOption = QCommandLineOption("scale-factor", "Set to a integer or default auto which controls"
                                              "the scale (DPI) of the desktop interface.");
        scaleOption.setValueName("scale");
        scaleOption.setDefaultValue("auto");

        auto platformOption = QCommandLineOption("platform", "Equivalant to QT_QPA_PLATFORM.");
        platformOption.setValueName("platform");
        platformOption.setDefaultValue("default");

        auto devOption = QCommandLineOption("remote-debugging-port", "Port number for devtools.");
        devOption.setValueName("port");
        parser.addOption(scaleOption);
        parser.addOption(devOption);
        parser.addOption(platformOption);

// #ifdef Q_OS_WIN
//         if (isWindows81OrOlder())
//         {
//             if (!g_qtFlags.contains("--disable-gpu"))
//                 g_qtFlags << "--disable-gpu";
//             if (!g_qtFlags.contains("--disable-gpu-compositing"))
//                 g_qtFlags << "--disable-gpu-compositing";
//             if (!g_qtFlags.contains("--disable-direct-composition"))
//                 g_qtFlags << "--disable-direct-composition";
//         }
// #endif

        qDebug() << "[win81-icons] final g_qtFlags=" << g_qtFlags.join(" ");

        char **newArgv = appendCommandLineArguments(argc, argv, g_qtFlags);
        int newArgc = argc + g_qtFlags.size();

        // Qt calls setlocale(LC_ALL, "") in a bunch of places, which breaks
        // float/string processing in mpv and ffmpeg.
#ifdef Q_OS_UNIX
        qputenv("LC_ALL", "C");
        qputenv("LC_NUMERIC", "C");
#endif

        preinitQt();
        detectOpenGLEarly();

        QStringList arguments;
        for (int i = 0; i < argc; i++)
            arguments << QString::fromLatin1(argv[i]);

        {
            // This is kinda dumb. But in order for the QCommandLineParser
            // to work properly we need to init if before we call process
            // but we don't want to do that for the main application since
            // we need to set the scale factor before we do that. So it becomes
            // a small chicken-or-egg problem, which we "solve" by making
            // this temporary console app.
            QCoreApplication core(newArgc, newArgv);

            // Now parse the command line.
            parser.process(arguments);
        }

        if (parser.isSet("licenses"))
        {
            ShowLicenseInfo();
            return EXIT_SUCCESS;
        }

        auto scale = parser.value("scale-factor");
        if (scale.isEmpty() || scale == "auto")
            QCoreApplication::setAttribute(Qt::AA_EnableHighDpiScaling);
        else if (scale != "none")
            qputenv("QT_SCALE_FACTOR", scale.toUtf8());

        auto platform = parser.value("platform");
        if (!(platform.isEmpty() || platform == "default"))
            qputenv("QT_QPA_PLATFORM", platform.toUtf8());

        QApplication app(newArgc, newArgv);
        app.setApplicationName("Jellyfin Media Player");

#ifdef Q_OS_WIN
        if (isWindows81OrOlder())
        {
            SystemComponent::Get().setWin81IconCompatEnabled(true);
            qDebug() << "[win81-icons] SystemComponent win81IconCompatEnabled=true";

            const QString materialIconsFamily = registerMaterialIconsFont();
            SystemComponent::Get().setMaterialIconsFontFamily(materialIconsFamily);
            qDebug() << "[win81-icons] SystemComponent materialIconsFontFamily="
                     << materialIconsFamily;
        }
        else
        {
            SystemComponent::Get().setWin81IconCompatEnabled(false);
            SystemComponent::Get().setMaterialIconsFontFamily(QStringLiteral("Material Icons"));
            qDebug() << "[win81-icons] SystemComponent win81IconCompatEnabled=false";
        }
#endif

#if defined(Q_OS_WIN)
        // Setting window icon on OSX will break user ability to change it
        app.setWindowIcon(QIcon(":/images/icon.png"));
#endif

#if defined(Q_OS_LINUX) || defined(Q_OS_FREEBSD)
        // Set window icon on Linux using system icon theme
        app.setWindowIcon(QIcon::fromTheme("com.github.iwalton3.jellyfin-media-player", QIcon(":/images/icon.png")));
        // Set app id for Wayland compositor window icon
        app.setDesktopFileName("com.github.iwalton3.jellyfin-media-player");
#endif

#if defined(Q_OS_MAC) && defined(NDEBUG)
        PFMoveToApplicationsFolderIfNecessary();
#endif

        UniqueApplication* uniqueApp = new UniqueApplication();
        if (!uniqueApp->ensureUnique())
            return EXIT_SUCCESS;

#ifdef Q_OS_UNIX
        // install signals handlers for proper app closing.
        SignalManager signalManager(&app);
        Q_UNUSED(signalManager);
#endif

        Log::Init();
        if (parser.isSet("terminal"))
            Log::EnableTerminalOutput();

        detectOpenGLLate();

        Codecs::preinitCodecs();

        // Initialize all the components. This needs to be done
        // early since most everything else relies on it
        ComponentManager::Get().initialize();

        SettingsComponent::Get().setCommandLineValues(parser.optionNames());

        QtWebEngine::initialize();

        // load QtWebChannel so that we can register our components with it.
        QQmlApplicationEngine *engine = Globals::Engine();

        KonvergoWindow::RegisterClass();
        Globals::SetContextProperty("components", &ComponentManager::Get().getQmlPropertyMap());

        // the only way to detect if QML parsing fails is to hook to this signal and then see
        // if we get a valid object passed to it. Any error messages will be reported on stderr
        // but since no normal user should ever see this it should be fine
        QObject::connect(engine, &QQmlApplicationEngine::objectCreated, [=](QObject* object, const QUrl& url)
        {
            Q_UNUSED(url);

            if (object == nullptr)
                throw FatalException(QObject::tr("Failed to parse application engine script."));

            KonvergoWindow* window = Globals::MainWindow();

            QObject* webChannelObject = qvariant_cast<QObject*>(window->property("webChannel"));
            Q_ASSERT(webChannelObject);

            QWebChannel* webChannel = qobject_cast<QWebChannel*>(webChannelObject);
            Q_ASSERT(webChannel);

            ComponentManager::Get().setWebChannel(webChannel);

            QObject::connect(uniqueApp, &UniqueApplication::otherApplicationStarted,
                             window, &KonvergoWindow::otherAppFocus);
        });

        engine->load(QUrl(QStringLiteral("qrc:/ui/webview.qml")));

        Log::UpdateLogLevel();

        int ret = app.exec();

        delete uniqueApp;
        Globals::EngineDestroy();

        Codecs::Uninit();
        Log::Uninit();
        return ret;
    }
    catch (FatalException& e)
    {
        qFatal("Unhandled FatalException: %s", qPrintable(e.message()));
        QApplication errApp(argc, argv);

        auto msg = new ErrorMessage(e.message(), true);
        msg->show();

        errApp.exec();

        Codecs::Uninit();
        Log::Uninit();
        return 1;
    }
}