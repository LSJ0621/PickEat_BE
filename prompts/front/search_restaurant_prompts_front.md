# Flutter 메뉴 검색 API 사용 가이드

## 개요
Flutter 앱에서 추천받은 메뉴 리스트에서 메뉴 이름을 터치하면, 해당 메뉴를 파는 주변 식당을 검색하는 기능을 구현합니다.

## API 엔드포인트

**URL**: `POST /search/restaurants`  
**Base URL**: `http://localhost:3000` (개발 환경) 또는 실제 서버 URL  
**인증**: JWT 토큰 필요 (Authorization 헤더에 Bearer 토큰 포함)

## 요청 구조

### HTTP 헤더
```
Content-Type: application/json
Authorization: Bearer {JWT_TOKEN}
```

### 요청 Body (JSON)
```json
{
  "menuName": "마라탕",
  "latitude": 37.585686,
  "longitude": 127.214138,
  "includeRoadAddress": false
}
```

### 요청 파라미터 설명

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `menuName` | string | ✅ | 검색할 메뉴 이름 (예: "마라탕", "치킨", "피자") |
| `latitude` | number | ✅ | 사용자의 현재 위도 (GPS 좌표) |
| `longitude` | number | ✅ | 사용자의 현재 경도 (GPS 좌표) |
| `includeRoadAddress` | boolean | ❌ | 도로명 주소 포함 여부 (기본값: false) |
| | | | - `true`: 도로명 주소까지 포함하여 검색 (검색 범위 좁음, 정확도 높음) |
| | | | - `false`: 기본 주소만 사용하여 검색 (검색 범위 넓음, 결과 많음) |

## 응답 구조

### 성공 응답 (201 Created)

```json
{
  "restaurants": [
    {
      "name": "마라탕 전문점",
      "address": "경기도 남양주시 와부읍 덕소리 123-45",
      "roadAddress": "경기도 남양주시 와부읍 덕소로97번길 12",
      "phone": "031-123-4567",
      "mapx": 127214138,
      "mapy": 37585686,
      "distance": 0.5,
      "link": "https://map.naver.com/..."
    },
    {
      "name": "중화요리 마라탕",
      "address": "경기도 남양주시 와부읍 덕소리 234-56",
      "roadAddress": "경기도 남양주시 와부읍 덕소로97번길 34",
      "phone": "031-234-5678",
      "mapx": 127214200,
      "mapy": 37585700,
      "distance": 0.8,
      "link": "https://map.naver.com/..."
    }
  ]
}
```

### 응답 필드 설명

| 필드 | 타입 | 설명 |
|------|------|------|
| `restaurants` | array | 검색된 식당 리스트 (최대 5개) |
| `restaurants[].name` | string | 식당 이름 |
| `restaurants[].address` | string | 지번 주소 |
| `restaurants[].roadAddress` | string? | 도로명 주소 (선택) |
| `restaurants[].phone` | string? | 전화번호 (선택) |
| `restaurants[].mapx` | number? | 네이버 지도 X 좌표 (TM 좌표계) |
| `restaurants[].mapy` | number? | 네이버 지도 Y 좌표 (TM 좌표계) |
| `restaurants[].distance` | number? | 사용자 위치로부터의 거리 (km) |
| `restaurants[].link` | string? | 네이버 지도 링크 (선택) |

### 에러 응답

#### 401 Unauthorized
```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```
**원인**: JWT 토큰이 없거나 만료됨  
**해결**: 로그인하여 새로운 토큰 발급

#### 400 Bad Request
```json
{
  "statusCode": 400,
  "message": "menuName must not be empty"
}
```
**원인**: `menuName`이 비어있거나 잘못된 형식  
**해결**: 유효한 메뉴 이름 입력

#### 500 Internal Server Error
```json
{
  "statusCode": 500,
  "message": "Failed to fetch local restaurants from Naver"
}
```
**원인**: 네이버 API 오류 또는 서버 내부 오류  
**해결**: 잠시 후 재시도

## Flutter 구현 예시

### 1. DTO 클래스 생성

```dart
// search_restaurants_request.dart
class SearchRestaurantsRequest {
  final String menuName;
  final double latitude;
  final double longitude;
  final bool? includeRoadAddress;

  SearchRestaurantsRequest({
    required this.menuName,
    required this.latitude,
    required this.longitude,
    this.includeRoadAddress,
  });

  Map<String, dynamic> toJson() {
    final Map<String, dynamic> data = {
      'menuName': menuName,
      'latitude': latitude,
      'longitude': longitude,
    };
    if (includeRoadAddress != null) {
      data['includeRoadAddress'] = includeRoadAddress;
    }
    return data;
  }
}

// restaurant_summary.dart
class RestaurantSummary {
  final String name;
  final String address;
  final String? roadAddress;
  final String? phone;
  final int? mapx;
  final int? mapy;
  final double? distance;
  final String? link;

  RestaurantSummary({
    required this.name,
    required this.address,
    this.roadAddress,
    this.phone,
    this.mapx,
    this.mapy,
    this.distance,
    this.link,
  });

  factory RestaurantSummary.fromJson(Map<String, dynamic> json) {
    return RestaurantSummary(
      name: json['name'] as String,
      address: json['address'] as String,
      roadAddress: json['roadAddress'] as String?,
      phone: json['phone'] as String?,
      mapx: json['mapx'] as int?,
      mapy: json['mapy'] as int?,
      distance: json['distance'] != null 
          ? (json['distance'] as num).toDouble() 
          : null,
      link: json['link'] as String?,
    );
  }
}

// search_restaurants_response.dart
class SearchRestaurantsResponse {
  final List<RestaurantSummary> restaurants;

  SearchRestaurantsResponse({
    required this.restaurants,
  });

  factory SearchRestaurantsResponse.fromJson(Map<String, dynamic> json) {
    return SearchRestaurantsResponse(
      restaurants: (json['restaurants'] as List)
          .map((item) => RestaurantSummary.fromJson(item as Map<String, dynamic>))
          .toList(),
    );
  }
}
```

### 2. API 서비스 클래스

```dart
// search_service.dart
import 'package:http/http.dart' as http;
import 'dart:convert';

class SearchService {
  static const String baseUrl = 'http://localhost:3000'; // 또는 실제 서버 URL
  
  Future<SearchRestaurantsResponse> searchRestaurants({
    required String menuName,
    required double latitude,
    required double longitude,
    bool? includeRoadAddress,
    required String jwtToken,
  }) async {
    final request = SearchRestaurantsRequest(
      menuName: menuName,
      latitude: latitude,
      longitude: longitude,
      includeRoadAddress: includeRoadAddress,
    );

    final response = await http.post(
      Uri.parse('$baseUrl/search/restaurants'),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $jwtToken',
      },
      body: jsonEncode(request.toJson()),
    );

    if (response.statusCode == 201) {
      final jsonData = jsonDecode(response.body) as Map<String, dynamic>;
      return SearchRestaurantsResponse.fromJson(jsonData);
    } else if (response.statusCode == 401) {
      throw Exception('인증 실패: JWT 토큰이 필요하거나 만료되었습니다.');
    } else if (response.statusCode == 400) {
      final error = jsonDecode(response.body);
      throw Exception('잘못된 요청: ${error['message']}');
    } else {
      throw Exception('검색 실패: ${response.statusCode}');
    }
  }
}
```

### 3. 위치 정보 가져오기

```dart
// 위치 권한 및 GPS 좌표 가져오기 예시
import 'package:geolocator/geolocator.dart';

Future<Position> getCurrentLocation() async {
  // 위치 권한 확인
  bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
  if (!serviceEnabled) {
    throw Exception('위치 서비스가 비활성화되어 있습니다.');
  }

  LocationPermission permission = await Geolocator.checkPermission();
  if (permission == LocationPermission.denied) {
    permission = await Geolocator.requestPermission();
    if (permission == LocationPermission.denied) {
      throw Exception('위치 권한이 거부되었습니다.');
    }
  }

  if (permission == LocationPermission.deniedForever) {
    throw Exception('위치 권한이 영구적으로 거부되었습니다.');
  }

  // 현재 위치 가져오기
  return await Geolocator.getCurrentPosition();
}
```

### 4. UI에서 사용 예시

```dart
// 메뉴 리스트 화면에서 메뉴 터치 시 검색
import 'package:flutter/material.dart';

class MenuListScreen extends StatefulWidget {
  final List<String> recommendedMenus;
  final String jwtToken;

  const MenuListScreen({
    required this.recommendedMenus,
    required this.jwtToken,
  });

  @override
  _MenuListScreenState createState() => _MenuListScreenState();
}

class _MenuListScreenState extends State<MenuListScreen> {
  final SearchService _searchService = SearchService();
  bool _isLoading = false;

  Future<void> _searchRestaurants(String menuName) async {
    setState(() {
      _isLoading = true;
    });

    try {
      // 현재 위치 가져오기
      final position = await getCurrentLocation();
      
      // 식당 검색
      final response = await _searchService.searchRestaurants(
        menuName: menuName,
        latitude: position.latitude,
        longitude: position.longitude,
        includeRoadAddress: false, // 기본값: false (검색 범위 넓게)
        jwtToken: widget.jwtToken,
      );

      // 검색 결과 화면으로 이동
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (context) => RestaurantListScreen(
            restaurants: response.restaurants,
            menuName: menuName,
          ),
        ),
      );
    } catch (e) {
      // 에러 처리
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('검색 실패: ${e.toString()}'),
          backgroundColor: Colors.red,
        ),
      );
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('추천 메뉴'),
      ),
      body: _isLoading
          ? Center(child: CircularProgressIndicator())
          : ListView.builder(
              itemCount: widget.recommendedMenus.length,
              itemBuilder: (context, index) {
                final menuName = widget.recommendedMenus[index];
                return ListTile(
                  title: Text(menuName),
                  trailing: Icon(Icons.arrow_forward_ios),
                  onTap: () => _searchRestaurants(menuName),
                );
              },
            ),
    );
  }
}
```

## 주요 구현 포인트

### 1. JWT 토큰 관리
- 로그인 시 받은 JWT 토큰을 안전하게 저장 (예: `shared_preferences`, `flutter_secure_storage`)
- 모든 요청에 `Authorization: Bearer {token}` 헤더 포함
- 토큰 만료 시 자동으로 재로그인 처리

### 2. 위치 정보
- `geolocator` 패키지 사용하여 GPS 좌표 가져오기
- 위치 권한 요청 및 처리
- 위치 서비스 비활성화 시 에러 처리

### 3. `includeRoadAddress` 파라미터 사용
- **기본값 (`false`)**: 검색 범위를 넓게 하여 더 많은 결과 반환
  ```dart
  includeRoadAddress: false  // "마라탕 경기도 남양주시 와부읍 덕소리"
  ```
- **`true`로 설정**: 검색 범위를 좁혀 정확한 위치의 식당만 검색
  ```dart
  includeRoadAddress: true  // "마라탕 경기도 남양주시 와부읍 덕소리 덕소로97번길 12"
  ```

### 4. 에러 처리
- 네트워크 에러 처리
- 인증 에러 처리 (401)
- 잘못된 요청 에러 처리 (400)
- 서버 에러 처리 (500)

### 5. 로딩 상태 관리
- 검색 중 로딩 인디케이터 표시
- 사용자가 중복 요청하지 않도록 버튼 비활성화

## 필요한 패키지

```yaml
dependencies:
  http: ^1.1.0
  geolocator: ^10.0.0
  shared_preferences: ^2.2.0  # JWT 토큰 저장용
  # 또는
  flutter_secure_storage: ^9.0.0  # JWT 토큰 안전하게 저장
```

## 테스트 예시

### cURL로 테스트
```bash
curl -X POST http://localhost:3000/search/restaurants \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "menuName": "마라탕",
    "latitude": 37.585686,
    "longitude": 127.214138,
    "includeRoadAddress": false
  }'
```

## 주의사항

1. **JWT 토큰**: 모든 요청에 유효한 JWT 토큰이 필요합니다.
2. **위치 정보**: 정확한 GPS 좌표를 제공해야 주변 식당 검색이 정확합니다.
3. **네트워크**: 인터넷 연결이 필요합니다.
4. **검색 결과**: 최대 5개의 식당만 반환됩니다.
5. **검색 범위**: `includeRoadAddress` 값에 따라 검색 범위가 달라집니다.

