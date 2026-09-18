plugins {
    id("com.android.application")
}

android {
    namespace = "com.woo.footscan"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.woo.footscan"
        minSdk = 24                 // 안드로이드 7 이상
        targetSdk = 35
        versionCode = 1
        versionName = "0.1"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

// 라이브러리를 하나도 쓰지 않습니다. 필요한 것은 안드로이드에 다 들어 있습니다.
dependencies { }
