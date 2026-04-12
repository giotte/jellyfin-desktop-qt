import QtQuick 2.4
import Konvergo 1.0
import QtWebEngine 1.7
import QtWebChannel 1.0
import QtQuick.Window 2.2
import QtQuick.Controls 1.4

KonvergoWindow
{
    id: mainWindow
    title: "Jellyfin Media Player"
    objectName: "mainWindow"
    minimumHeight: windowMinSize.height
    minimumWidth: windowMinSize.width

    function loadTextResource(url)
    {
        try
        {
            var xhr = new XMLHttpRequest()
            xhr.open("GET", url, false)
            xhr.send()

            if (xhr.status === 200 || xhr.status === 0)
            {
                var text = xhr.responseText || ""
                console.log("[win81-icons] Loaded text resource: " + url + " bytes=" + text.length)
                return text
            }

            console.log("[win81-icons] Failed loading text resource: " + url + " status=" + xhr.status)
            return ""
        }
        catch (e)
        {
            console.log("[win81-icons] Exception loading text resource: " + url + " error=" + e)
            return ""
        }
    }

    function jsStringEscape(str)
    {
        if (!str)
            return ""

        return str
        .replace(/\\/g, "\\\\")
        .replace(/'/g, "\\'")
        .replace(/\r/g, "\\r")
        .replace(/\n/g, "\\n")
        .replace(/\u2028/g, "\\u2028")
        .replace(/\u2029/g, "\\u2029")
    }

    function shouldApplyWin81IconCompat()
    {
        try
        {
            return components.system.isWindows && components.system.win81IconCompatEnabled
        }
        catch (e)
        {
            console.log("[win81-icons] Exception checking compat flag: " + e)
            return false
        }
    }

    function injectWin81IconCompat()
    {
        try
        {
            console.log("[win81-icons] inject start")

            var css = loadTextResource("qrc:/compat/win81-icons.css")
            var js = loadTextResource("qrc:/compat/win81-icons.js")

            if (css.length === 0 || js.length === 0)
            {
                console.log("[win81-icons] missing compat resources css=" + css.length + " js=" + js.length)
                return
            }

            var materialFamily = "Material Icons"
            try
            {
                materialFamily = components.system.materialIconsFontFamily
                if (!materialFamily || materialFamily.length === 0)
                    materialFamily = "Material Icons"
            }
            catch (e2)
            {
                console.log("[win81-icons] failed reading materialIconsFontFamily: " + e2)
                materialFamily = "Material Icons"
            }

            console.log("[win81-icons] material family: " + materialFamily)

            if (materialFamily !== "Material Icons")
            {
                css = ":root { --jmp-material-icons-family: '" + materialFamily + "', 'JMPCompatMaterialIcons', 'Material Icons'; }\n" + css
            }

            var cssPayload = jsStringEscape(css)
            var jsPayload = jsStringEscape(js)

            web.runJavaScript(
                "(function(){"
              + "try{"
              + "var s=document.getElementById('jmp-win81-icon-compat');"
              + "if(!s){"
              + "s=document.createElement('style');"
              + "s.id='jmp-win81-icon-compat';"
              + "(document.head||document.documentElement).appendChild(s);"
              + "}"
              + "s.textContent='" + cssPayload + "';"
              + "console.log('[win81-icons] css injected bytes=' + s.textContent.length);"
              + "}catch(e){console.log('[win81-icons] css injection exception: ' + e);}"
              + "})();"
            )

            web.runJavaScript(
                "(function(){"
              + "try{"
              + "var old=document.getElementById('jmp-win81-icon-script');"
              + "if(old && old.parentNode) old.parentNode.removeChild(old);"
              + "var s=document.createElement('script');"
              + "s.id='jmp-win81-icon-script';"
              + "s.text='" + jsPayload + "';"
              + "(document.head||document.documentElement).appendChild(s);"
              + "console.log('[win81-icons] js injected bytes=' + s.text.length);"
              + "}catch(e){console.log('[win81-icons] js injection exception: ' + e);}"
              + "})();"
            )

            web.runJavaScript(
                "(function(){"
              + "try{"
              + "var n=document.querySelectorAll('.material-icons, i.material-icons, [class*=\"material-icons\"], .md-icon, .paper-icon-button-light i, .headerButton i, .playstatebutton i').length;"
              + "console.log('[win81-icons] immediate icon node count=' + n);"
              + "}catch(e){console.log('[win81-icons] icon count exception: ' + e);}"
              + "})();"
            )
        }
        catch (e)
        {
            console.log("[win81-icons] inject exception: " + e)
        }
    }

    function runWebAction(action)
    {
        if (mainWindow.webDesktopMode)
            web.triggerWebAction(action)
    }

    Action
    {
        enabled: mainWindow.webDesktopMode
        shortcut:
        {
            if (components.system.isMacos) return "Ctrl+Meta+F"
            return "F11"
        }
        onTriggered: mainWindow.toggleFullscreen()
    }

    Action
    {
        shortcut: "Alt+Return"
        enabled:
        {
            if (mainWindow.webDesktopMode && components.system.isWindows)
                return true;
            return false;
        }
        onTriggered: mainWindow.toggleFullscreen()
    }

    Action
    {
        enabled: mainWindow.webDesktopMode
        shortcut: StandardKey.Close
        onTriggered: mainWindow.close()
    }

    Action
    {
        enabled: mainWindow.webDesktopMode
        shortcut: {
            if (components.system.isMacos) return "Ctrl+M";
            return "Meta+Down";
        }
        onTriggered: mainWindow.minimizeWindow()
    }

    Action
    {
        enabled: mainWindow.webDesktopMode
        shortcut: StandardKey.Quit
        onTriggered: mainWindow.close()
    }

    Action
    {
        shortcut: "Ctrl+Shift+D"
        enabled: mainWindow.webDesktopMode
        onTriggered: mainWindow.toggleDebug()
    }

    Action
    {
        shortcut: StandardKey.Copy
        onTriggered: runWebAction(WebEngineView.Copy)
        id: action_copy
    }

    Action
    {
        shortcut: StandardKey.Cut
        onTriggered: runWebAction(WebEngineView.Cut)
        id: action_cut
    }

    Action
    {
        shortcut: StandardKey.Paste
        onTriggered: runWebAction(WebEngineView.Paste)
        id: action_paste
    }

    Action
    {
        shortcut: StandardKey.SelectAll
        onTriggered: runWebAction(WebEngineView.SelectAll)
        id: action_selectall
    }

    Action
    {
        shortcut: StandardKey.Undo
        onTriggered: runWebAction(WebEngineView.Undo)
        id: action_undo
    }

    Action
    {
        shortcut: StandardKey.Redo
        onTriggered: runWebAction(WebEngineView.Redo)
        id: action_redo
    }

    Action
    {
        shortcut: StandardKey.Back
        onTriggered: runWebAction(WebEngineView.Back)
        id: action_back
    }

    Action
    {
        shortcut: StandardKey.Forward
        onTriggered: runWebAction(WebEngineView.Forward)
        id: action_forward
    }

    MpvVideo
    {
        id: video
        objectName: "video"
        // It's not a real item. Its renderer draws onto the view's background.
        width: 0
        height: 0
        visible: false
    }

    WebEngineView
    {
        id: web
        objectName: "web"
        settings.errorPageEnabled: false
        settings.localContentCanAccessRemoteUrls: true
        settings.localContentCanAccessFileUrls: true
        settings.allowRunningInsecureContent: true
        settings.playbackRequiresUserGesture: false
        profile.httpUserAgent: components.system.getUserAgent()
        profile.httpCacheType: WebEngineProfile.MemoryHttpCache
        url: mainWindow.webUrl
        focus: true
        property string currentHoveredUrl: ""
        onLinkHovered: web.currentHoveredUrl = hoveredUrl
        width: mainWindow.width
        height: mainWindow.height
        userScripts: [
            WebEngineScript
            {
                sourceCode: components.system.getNativeShellScript()
                injectionPoint: WebEngineScript.DocumentCreation
                worldId: WebEngineScript.MainWorld
            }
        ]

        Component.onCompleted:
        {
            forceActiveFocus()
            mainWindow.reloadWebClient.connect(reload)
        }

        onLoadingChanged:
        {
            // we use a timer here to switch to the webview since
            // it take a few moments for the webview to render
            // after it has loaded.
            //
            if (loadRequest.status == WebEngineView.LoadStartedStatus)
            {
                console.log("WebEngineLoadRequest starting: " + loadRequest.url);
            }
            else if (loadRequest.status == WebEngineView.LoadSucceededStatus)
            {
                console.log("WebEngineLoadRequest success: " + loadRequest.url);

                try
                {
                    console.log("[win81-icons] load succeeded; compatEnabled="
                                + shouldApplyWin81IconCompat()
                                + " family=" + components.system.materialIconsFontFamily);
                }
                catch (e)
                {
                    console.log("[win81-icons] load success logging exception: " + e);
                }

                if (shouldApplyWin81IconCompat())
                    injectWin81IconCompat()
            }
            else if (loadRequest.status == WebEngineView.LoadFailedStatus)
            {
                console.log("WebEngineLoadRequest failure: " + loadRequest.url + " error code: " + loadRequest.errorCode);
                errorLabel.visible = true
                errorLabel.text = "Error loading client, this is bad and should not happen\n"
                                + "You can try to reload or head to our support page\nActual Error:\n\n> "
                                + loadRequest.errorString + " [" + loadRequest.errorCode + "]"
            }
        }

        onNewViewRequested:
        {
            if (request.userInitiated)
            {
                console.log("Opening external URL: " + web.currentHoveredUrl);
                components.system.openExternalUrl(web.currentHoveredUrl);
            }
        }

        onFullScreenRequested:
        {
            console.log("Request fullscreen: " + request.toggleOn);
            mainWindow.setFullScreen(request.toggleOn);
            request.accept();
        }

        onJavaScriptConsoleMessage:
        {
            components.system.info(message)
        }

        onCertificateError:
        {
            console.log(error.url + " " + error.description + " " + error.error);
            if (components.settings.ignoreSSLErrors)
                error.ignoreCertificateError();
        }
    }

    Text
    {
        id: errorLabel
        z: 5
        anchors.centerIn: parent
        color: "#999999"
        linkColor: "#a85dc3"
        text: "Generic error"
        font.pixelSize: 32
        font.bold: true
        visible: false
        horizontalAlignment: Text.AlignHCenter
        verticalAlignment: Text.AlignVCenter
        textFormat: Text.StyledText

        onLinkActivated:
        {
            if (link == "reload")
            {
                errorLabel.visible = false
                web.reload()
            }
            else
            {
                Qt.openUrlExternally(link)
            }
        }
    }

    Rectangle
    {
        id: debug
        color: "black"
        z: 10
        anchors.centerIn: parent
        width: parent.width
        height: parent.height
        opacity: 0.7
        visible: mainWindow.showDebugLayer

        Text
        {
            id: debugLabel
            width: (parent.width - 50) / 2
            height: parent.height - 25
            anchors.left: parent.left
            anchors.leftMargin: 64
            anchors.top: parent.top
            anchors.topMargin: 54
            anchors.bottomMargin: 54
            color: "white"
            font.pixelSize: Math.round(height / 65)
            wrapMode: Text.WrapAnywhere

            function windowDebug()
            {
                var dbg = mainWindow.debugInfo
                dbg += "Window and web\n"
                dbg += " Window size: " + parent.width + " x " + parent.height + " - " + web.width + " x " + web.height + "\n"
                dbg += " DevicePixel ratio: " + Screen.devicePixelRatio + "\n"
                return dbg
            }

            text: windowDebug()
        }

        Text
        {
            id: videoLabel
            width: (parent.width - 50) / 2
            height: parent.height - 25
            anchors.right: parent.right
            anchors.left: debugLabel.right
            anchors.rightMargin: 64
            anchors.top: parent.top
            anchors.topMargin: 54
            anchors.bottomMargin: 54
            color: "white"
            font.pixelSize: Math.round(height / 65)
            wrapMode: Text.WrapAnywhere
            text: mainWindow.videoInfo
        }
    }

    property QtObject webChannel: web.webChannel
}