package com.dinesense.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.DownloadManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

public class MainActivity extends Activity {
    private static final String PREFS = "dinesense";
    private static final String PREF_SERVER = "server_url";
    private static final String CHANNEL_ID = "pickup";
    private static final int REQ_FILE = 1001;
    private static final int REQ_NOTIFICATIONS = 1002;
    private static final int COLOR_BG = Color.parseColor("#0B0A08");
    private static final int COLOR_SURFACE = Color.parseColor("#14110D");
    private static final int COLOR_LINE = Color.parseColor("#2E2822");
    private static final int COLOR_INK = Color.parseColor("#F4EFE4");
    private static final int COLOR_MUTED = Color.parseColor("#A79D8E");
    private static final int COLOR_ACCENT = Color.parseColor("#E5B14C");
    private static final int COLOR_CORAL = Color.parseColor("#F0795F");

    private WebView webView;
    private View setupView;
    private EditText serverInput;
    private TextView setupMessage;
    private ValueCallback<Uri[]> fileCallback;
    private String currentServerUrl;
    private String pendingPath;
    private String pendingNotificationTitle;
    private String pendingNotificationBody;
    private boolean initialLoadStarted;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(COLOR_BG);
        getWindow().setNavigationBarColor(COLOR_BG);
        getWindow().getDecorView().setSystemUiVisibility(0);
        createNotificationChannel();
        buildUi();

        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        currentServerUrl = prefs.getString(PREF_SERVER, null);
        handleIntent(getIntent());

        if (currentServerUrl == null || currentServerUrl.isEmpty()) {
            showServerSetup("Connect to the restaurant Wi-Fi, then enter the server address.", BuildConfig.DEFAULT_SERVER_URL);
        } else if (!initialLoadStarted && (setupView == null || setupView.getVisibility() != View.VISIBLE)) {
            hideServerSetup();
            webView.loadUrl(currentServerUrl);
        }

        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, REQ_NOTIFICATIONS);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        if (intent == null) return;
        pendingPath = intent.getStringExtra("dinesense_path");
        boolean wantsServerSetup = intent.getBooleanExtra("show_server_setup", false);
        if (wantsServerSetup) {
            showServerSetup("Server settings", currentServerUrl != null ? currentServerUrl : BuildConfig.DEFAULT_SERVER_URL);
            return;
        }
        if (pendingPath != null && currentServerUrl != null && !currentServerUrl.isEmpty()) {
            String target = currentServerUrl + pendingPath;
            pendingPath = null;
            initialLoadStarted = true;
            hideServerSetup();
            webView.loadUrl(target);
        }
    }

    private void buildUi() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(COLOR_BG);

        webView = new WebView(this);
        webView.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        root.addView(webView);
        configureWebView();

        setupView = buildSetupView();
        root.addView(setupView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
        hideServerSetup();
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccess(false);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setUserAgentString(settings.getUserAgentString() + " DineSenseApp/1.0.0");

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
        WebView.setWebContentsDebuggingEnabled(false);

        webView.setBackgroundColor(COLOR_BG);
        webView.addJavascriptInterface(new DineSenseBridge(), "DineSenseApp");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleUrl(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleUrl(Uri.parse(url));
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                injectPrintHook();
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    String detail = error != null ? String.valueOf(error.getDescription()) : "Network error";
                    showServerSetup("Could not reach " + (currentServerUrl == null ? "the server" : currentServerUrl)
                            + ".\nCheck the Wi-Fi and server address.\n\n" + detail,
                            currentServerUrl == null ? BuildConfig.DEFAULT_SERVER_URL : currentServerUrl);
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                if (params != null) {
                    String[] accept = params.getAcceptTypes();
                    if (accept != null && accept.length > 0) {
                        String[] mimeTypes = new String[accept.length];
                        int count = 0;
                        for (String value : accept) {
                            if (value != null && value.contains("/")) mimeTypes[count++] = value;
                        }
                        if (count > 0) {
                            String[] trimmed = new String[count];
                            System.arraycopy(mimeTypes, 0, trimmed, 0, count);
                            intent.putExtra(Intent.EXTRA_MIME_TYPES, trimmed);
                        }
                    }
                    if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) {
                        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                    }
                }
                try {
                    startActivityForResult(Intent.createChooser(intent, "Choose a file"), REQ_FILE);
                    return true;
                } catch (Exception caught) {
                    fileCallback = null;
                    return false;
                }
            }
        });

        webView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition,
                                        String mimeType, long contentLength) {
                try {
                    DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                    request.addRequestHeader("User-Agent", userAgent);
                    String cookie = CookieManager.getInstance().getCookie(url);
                    if (cookie != null) request.addRequestHeader("Cookie", cookie);
                    if (mimeType != null) request.setMimeType(mimeType);
                    request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                    request.setDestinationInExternalPublicDir(
                            Environment.DIRECTORY_DOWNLOADS,
                            URLUtil.guessFileName(url, contentDisposition, mimeType));
                    DownloadManager manager = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                    if (manager != null) {
                        manager.enqueue(request);
                        Toast.makeText(MainActivity.this, "Download started", Toast.LENGTH_SHORT).show();
                    }
                } catch (Exception caught) {
                    Toast.makeText(MainActivity.this, "Could not download the file", Toast.LENGTH_LONG).show();
                }
            }
        });
    }

    private boolean handleUrl(Uri uri) {
        if (uri == null) return false;
        String scheme = uri.getScheme();
        if ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) {
            if (isAllowedHost(uri)) return false;
            openExternal(uri);
            return true;
        }
        if (scheme != null && !"about".equalsIgnoreCase(scheme) && !"blob".equalsIgnoreCase(scheme)
                && !"data".equalsIgnoreCase(scheme) && !"javascript".equalsIgnoreCase(scheme)) {
            openExternal(uri);
            return true;
        }
        return false;
    }

    private boolean isAllowedHost(Uri uri) {
        if (currentServerUrl == null) return false;
        Uri server = Uri.parse(currentServerUrl);
        String host = uri.getHost();
        String serverHost = server.getHost();
        return host != null && serverHost != null && host.equalsIgnoreCase(serverHost);
    }

    private void openExternal(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (Exception caught) {
            Toast.makeText(this, "No app can open this link", Toast.LENGTH_SHORT).show();
        }
    }

    private View buildSetupView() {
        FrameLayout overlay = new FrameLayout(this);
        overlay.setBackgroundColor(COLOR_BG);

        LinearLayout wrap = new LinearLayout(this);
        wrap.setOrientation(LinearLayout.VERTICAL);
        wrap.setGravity(Gravity.CENTER);
        wrap.setPadding(dp(24), dp(24), dp(24), dp(24));
        overlay.addView(wrap, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(24), dp(24), dp(24), dp(20));
        card.setBackground(roundedDrawable(COLOR_SURFACE, COLOR_LINE, 24));
        LinearLayout.LayoutParams cardParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        wrap.addView(card, cardParams);

        TextView title = new TextView(this);
        title.setText(R.string.setup_title);
        title.setTextColor(COLOR_INK);
        title.setTextSize(28);
        title.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
        card.addView(title);

        TextView subtitle = new TextView(this);
        subtitle.setText(R.string.setup_subtitle);
        subtitle.setTextColor(COLOR_ACCENT);
        subtitle.setTextSize(12);
        subtitle.setPadding(0, dp(4), 0, dp(4));
        card.addView(subtitle);

        TextView help = new TextView(this);
        help.setText(R.string.setup_help);
        help.setTextColor(COLOR_MUTED);
        help.setTextSize(14);
        help.setPadding(0, dp(4), 0, dp(16));
        card.addView(help);

        TextView serverLabel = new TextView(this);
        serverLabel.setText(R.string.server_label);
        serverLabel.setTextColor(COLOR_MUTED);
        serverLabel.setTextSize(12);
        card.addView(serverLabel);

        serverInput = new EditText(this);
        serverInput.setSingleLine(true);
        serverInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        serverInput.setTextColor(COLOR_INK);
        serverInput.setHintTextColor(COLOR_MUTED);
        serverInput.setTextSize(16);
        serverInput.setPadding(dp(14), dp(12), dp(14), dp(12));
        serverInput.setBackground(roundedDrawable(COLOR_BG, COLOR_LINE, 12));
        serverInput.setSelectAllOnFocus(true);
        LinearLayout.LayoutParams inputParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(52));
        inputParams.topMargin = dp(4);
        card.addView(serverInput, inputParams);

        Button connect = new Button(this);
        connect.setText(R.string.connect);
        connect.setTextColor(COLOR_BG);
        connect.setTextSize(16);
        connect.setAllCaps(false);
        connect.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
        connect.setBackground(roundedDrawable(COLOR_ACCENT, 0, 14));
        LinearLayout.LayoutParams buttonParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(56));
        buttonParams.topMargin = dp(14);
        card.addView(connect, buttonParams);
        connect.setOnClickListener(view -> connectFromSetup());

        setupMessage = new TextView(this);
        setupMessage.setTextColor(COLOR_MUTED);
        setupMessage.setTextSize(12);
        setupMessage.setPadding(0, dp(12), 0, 0);
        card.addView(setupMessage);

        TextView note = new TextView(this);
        note.setText(R.string.setup_note);
        note.setTextColor(COLOR_MUTED);
        note.setTextSize(11);
        note.setPadding(0, dp(12), 0, 0);
        card.addView(note);

        return overlay;
    }

    private void connectFromSetup() {
        String normalized = normalizeServer(serverInput.getText().toString());
        Uri uri = normalized == null ? null : Uri.parse(normalized);
        if (uri == null || uri.getHost() == null
                || (!"http".equalsIgnoreCase(uri.getScheme()) && !"https".equalsIgnoreCase(uri.getScheme()))) {
            setupMessage.setTextColor(COLOR_CORAL);
            setupMessage.setText("Enter a valid address, for example http://192.168.1.46");
            return;
        }
        currentServerUrl = normalized;
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(PREF_SERVER, normalized).apply();
        hideServerSetup();
        String target = normalized + (pendingPath == null ? "" : pendingPath);
        pendingPath = null;
        webView.setVisibility(View.VISIBLE);
        webView.loadUrl(target);
    }

    private String normalizeServer(String value) {
        if (value == null) return null;
        String result = value.trim();
        if (result.isEmpty()) return null;
        if (!result.matches("^[a-zA-Z][a-zA-Z0-9+.-]*://.*")) result = "http://" + result;
        while (result.endsWith("/")) result = result.substring(0, result.length() - 1);
        return result;
    }

    private void showServerSetup(String message, String prefill) {
        if (setupView == null) return;
        setupMessage.setTextColor(COLOR_MUTED);
        setupMessage.setText(message);
        if (serverInput != null) {
            if (prefill != null && !prefill.isEmpty()) serverInput.setText(prefill);
            serverInput.setSelection(serverInput.getText().length());
        }
        setupView.setVisibility(View.VISIBLE);
        if (webView != null) webView.setVisibility(View.INVISIBLE);
    }

    private void hideServerSetup() {
        if (setupView != null) setupView.setVisibility(View.GONE);
        if (webView != null) webView.setVisibility(View.VISIBLE);
    }

    private void injectPrintHook() {
        webView.evaluateJavascript(
                "(function(){if(window.__dinesensePrintHook)return;window.__dinesensePrintHook=true;window.print=function(){try{window.DineSenseApp.printPage();}catch(e){}};})();",
                null);
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "Pickup alerts", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Food ready for pickup");
        channel.enableVibration(true);
        channel.setVibrationPattern(new long[]{0, 220, 120, 220});
        manager.createNotificationChannel(channel);
    }

    private void showPickupNotification(String title, String body) {
        String safeTitle = title == null || title.trim().isEmpty() ? "Food ready for pickup" : title.trim();
        String safeBody = body == null ? "" : body.trim();
        if (safeTitle.length() > 120) safeTitle = safeTitle.substring(0, 120);
        if (safeBody.length() > 300) safeBody = safeBody.substring(0, 300);

        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
            pendingNotificationTitle = safeTitle;
            pendingNotificationBody = safeBody;
            requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, REQ_NOTIFICATIONS);
            return;
        }

        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pending = PendingIntent.getActivity(
                this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder = new Notification.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_dinesense)
                .setContentTitle(safeTitle)
                .setContentText(safeBody)
                .setStyle(new Notification.BigTextStyle().bigText(safeBody))
                .setColor(COLOR_ACCENT)
                .setAutoCancel(true)
                .setContentIntent(pending)
                .setCategory(Notification.CATEGORY_MESSAGE)
                .setVisibility(Notification.VISIBILITY_PUBLIC);
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify((int) (System.currentTimeMillis() & 0x7fffffff), builder.build());
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_NOTIFICATIONS && grantResults.length > 0
                && grantResults[0] == PackageManager.PERMISSION_GRANTED
                && pendingNotificationTitle != null) {
            String title = pendingNotificationTitle;
            String body = pendingNotificationBody;
            pendingNotificationTitle = null;
            pendingNotificationBody = null;
            showPickupNotification(title, body);
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_FILE || fileCallback == null) return;
        Uri[] results = null;
        if (resultCode == RESULT_OK && data != null) {
            ClipData clip = data.getClipData();
            if (clip != null) {
                results = new Uri[clip.getItemCount()];
                for (int i = 0; i < clip.getItemCount(); i++) {
                    results[i] = clip.getItemAt(i).getUri();
                }
            } else if (data.getData() != null) {
                results = new Uri[]{data.getData()};
            }
        }
        fileCallback.onReceiveValue(results);
        fileCallback = null;
    }

    @Override
    protected void onPause() {
        CookieManager.getInstance().flush();
        super.onPause();
    }

    @Override
    public void onBackPressed() {
        if (setupView != null && setupView.getVisibility() == View.VISIBLE) {
            super.onBackPressed();
            return;
        }
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.removeJavascriptInterface("DineSenseApp");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private GradientDrawable roundedDrawable(int fill, int stroke, int radiusDp) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(fill);
        drawable.setCornerRadius(dp(radiusDp));
        if (stroke != 0) drawable.setStroke(dp(1), stroke);
        return drawable;
    }

    private class DineSenseBridge {
        @JavascriptInterface
        public void notifyPickup(String title, String body) {
            runOnUiThread(() -> showPickupNotification(title, body));
        }

        @JavascriptInterface
        public String notificationPermission() {
            if (Build.VERSION.SDK_INT < 33
                    || checkSelfPermission("android.permission.POST_NOTIFICATIONS") == PackageManager.PERMISSION_GRANTED) {
                return "granted";
            }
            return "denied";
        }

        @JavascriptInterface
        public void setKeepScreenOn(boolean keep) {
            runOnUiThread(() -> {
                if (keep) {
                    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                } else {
                    getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                }
            });
        }

        @JavascriptInterface
        public void printPage() {
            runOnUiThread(() -> {
                if (webView == null) return;
                PrintManager manager = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                if (manager == null) return;
                PrintDocumentAdapter adapter = webView.createPrintDocumentAdapter("DineSense bill");
                manager.print("DineSense bill", adapter, new PrintAttributes.Builder().build());
            });
        }
    }
}
