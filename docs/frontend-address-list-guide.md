# 프론트엔드 주소 리스트 기능 활용 가이드

## 📋 개요

사용자가 최대 4개의 주소를 저장하고 관리할 수 있는 주소 리스트 기능입니다. 각 주소는 기본 주소(마이페이지 표시용)와 검색 주소(메뉴 추천/검색 시 사용)로 설정할 수 있습니다.

### 서비스 흐름

1. **회원가입 후 로그인**: 주소와 취향정보가 없어서 등록하라는 카드가 표시됨
2. **처음 주소 등록**: 로그인 직후 첫 번째 주소를 등록하면 자동으로 기본주소로 설정됨 (`PATCH /user/address` 사용)
3. **마이페이지에서 주소 관리**: 카카오 API로 주소를 검색하고 하나씩 추가하여 주소 리스트를 작성
4. **편집 모드**: 기본주소를 제외한 1~3개를 선택하여 삭제 가능 (soft delete, 주소리스트에서만 안보임)

**중요**: 로그인 시 주소 정보는 자동으로 기본주소에서 가져와서 반환됩니다.

---

## 🔌 API 엔드포인트

### 0. 로그인 시 주소 정보 확인

**로그인 응답** (`POST /auth/login`, `POST /auth/kakao`, `POST /auth/google` 등):

```typescript
{
  token: string;
  refreshToken: string;
  email: string;
  address: string | null; // 기본주소의 roadAddress (없으면 null)
  latitude: number | null; // 기본주소의 latitude (없으면 null)
  longitude: number | null; // 기본주소의 longitude (없으면 null)
  name: string | null;
  preferences: UserPreferences | null;
}
```

**사용 예시**:
```typescript
// 로그인 후 주소 정보 확인
const loginResponse = await fetch('/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password })
});
const authResult = await loginResponse.json();

// 주소 정보가 없으면 팝업 표시
if (!authResult.address || !authResult.latitude || !authResult.longitude) {
  // 주소 등록 팝업 표시
  showAddressRegistrationPopup();
}
```

**주의사항**:
- 로그인 응답의 `address`, `latitude`, `longitude`는 `UserAddress` 리스트의 기본주소에서 가져옵니다
- 기본주소가 없으면 `null`이 반환됩니다
- 처음 회원가입한 사용자는 주소 정보가 없으므로 팝업을 표시하여 주소 등록을 유도해야 합니다

---

### 1. 처음 주소 등록 (로그인 직후)

**PATCH** `/user/address`

**인증**: JWT 토큰 필요

**요청 Body**:
```typescript
{
  selectedAddress: {
    address: string; // 지번주소
    roadAddress: string | null; // 도로명 주소
    postalCode: string | null; // 우편번호
    latitude: string; // 위도
    longitude: string; // 경도
  }
}
```

**응답**:
```typescript
{
  address: string; // 저장된 주소
}
```

**사용 예시**:
```typescript
// 처음 주소 등록 (로그인 직후 팝업에서 사용)
const response = await fetch('/user/address', {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    selectedAddress: {
      address: "서울특별시 강남구 역삼동",
      roadAddress: "서울특별시 강남구 테헤란로 123",
      postalCode: "06234",
      latitude: "37.5665",
      longitude: "127.0780"
    }
  })
});
const result = await response.json();
// 주소가 자동으로 기본주소로 설정됨
```

**주의사항**:
- **처음 주소를 등록할 때** (`UserAddress` 리스트가 비어있을 때) 사용하면 자동으로:
  - `UserAddress` 리스트에 추가됨
  - 기본주소(`isDefault: true`)로 설정됨
  - 검색주소(`isSearchAddress: true`)로 설정됨
- 이후 주소를 추가하려면 `POST /user/addresses` 엔드포인트를 사용하세요

---

### 2. 주소 검색 (카카오 API)

**GET** `/user/address/search?query={검색어}`

**인증**: JWT 토큰 필요

**쿼리 파라미터**:
- `query`: 검색할 주소 (string)

**응답**:
```typescript
{
  meta: {
    total_count: number;
    pageable_count: number;
    is_end: boolean;
  };
  addresses: Array<{
    address: string; // 지번주소
    roadAddress: string | null; // 도로명 주소
    postalCode: string | null; // 우편번호
    latitude: string; // 위도
    longitude: string; // 경도
  }>;
}
```

**사용 예시**:
```typescript
// 주소 검색
const response = await fetch('/user/address/search?query=강남구', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
const searchResult = await response.json();
// searchResult.addresses 배열에서 선택
```

---

### 3. 기본 주소 조회 (마이페이지용)

**GET** `/user/address/default`

**인증**: JWT 토큰 필요

**응답**:
```typescript
{
  id: number;
  roadAddress: string;
  postalCode: string | null;
  latitude: number;
  longitude: number;
  isDefault: boolean;
  isSearchAddress: boolean;
  alias: string | null;
  createdAt: Date;
  updatedAt: Date;
} | null
```

**사용 예시**:
```typescript
// 마이페이지에서 기본 주소 표시
const response = await fetch('/user/address/default', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
const defaultAddress = await response.json();
```

---

### 4. 주소 리스트 조회

**GET** `/user/addresses`

**인증**: JWT 토큰 필요

**응답**:
```typescript
Array<{
  id: number;
  roadAddress: string;
  postalCode: string | null;
  latitude: number;
  longitude: number;
  isDefault: boolean;
  isSearchAddress: boolean;
  alias: string | null;
  createdAt: Date;
  updatedAt: Date;
}>
```

**사용 예시**:
```typescript
// 주소 리스트 화면에서 모든 주소 표시
const response = await fetch('/user/addresses', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
const addresses = await response.json();
```

**주의사항**:
- 삭제된 주소(soft delete)는 리스트에 포함되지 않습니다
- 최신순으로 정렬되어 반환됩니다

---

### 5. 주소 추가 (마이페이지에서 하나씩 추가)

**POST** `/user/addresses`

**인증**: JWT 토큰 필요

**요청 Body**:
```typescript
{
  selectedAddress: {
    address: string; // 지번주소
    roadAddress: string | null; // 도로명 주소
    postalCode: string | null; // 우편번호
    latitude: string; // 위도
    longitude: string; // 경도
  };
  alias?: string; // 주소 별칭 (선택사항, 예: "집", "회사")
  isDefault?: boolean; // 기본 주소로 설정할지 여부 (선택사항)
  isSearchAddress?: boolean; // 검색 주소로 설정할지 여부 (선택사항)
}
```

**응답**:
```typescript
{
  id: number;
  roadAddress: string;
  postalCode: string | null;
  latitude: number;
  longitude: number;
  isDefault: boolean;
  isSearchAddress: boolean;
  alias: string | null;
  createdAt: Date;
  updatedAt: Date;
}
```

**사용 예시**:
```typescript
// 마이페이지에서 카카오 API로 주소 검색 후 하나씩 추가
const response = await fetch('/user/addresses', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    selectedAddress: {
      address: "서울특별시 강남구 역삼동",
      roadAddress: "서울특별시 강남구 테헤란로 123",
      postalCode: "06234",
      latitude: "37.5665",
      longitude: "127.0780"
    },
    alias: "회사"
  })
});
const newAddress = await response.json();
```

**주의사항**:
- 최대 4개까지만 저장 가능 (초과 시 400 에러)
- 마이페이지에서는 카카오 API로 주소를 검색한 후 하나씩 추가
- 두 번째 주소부터는 이 엔드포인트를 사용하며, `isDefault`와 `isSearchAddress`를 선택적으로 설정할 수 있음
- **여러 개를 한번에 추가하는 기능은 없습니다** - 하나씩 추가해야 합니다

---

### 6. 주소 수정

**PATCH** `/user/addresses/:id`

**인증**: JWT 토큰 필요

**URL 파라미터**:
- `id`: 주소 ID (number)

**요청 Body** (부분 수정 가능):
```typescript
{
  roadAddress?: string; // 도로명 주소
  latitude?: number; // 위도
  longitude?: number; // 경도
  alias?: string; // 주소 별칭
  isDefault?: boolean; // 기본 주소 여부
  isSearchAddress?: boolean; // 검색 주소 여부
}
```

**응답**:
```typescript
{
  id: number;
  roadAddress: string;
  postalCode: string | null;
  latitude: number;
  longitude: number;
  isDefault: boolean;
  isSearchAddress: boolean;
  alias: string | null;
  createdAt: Date;
  updatedAt: Date;
}
```

**사용 예시**:
```typescript
// 주소 별칭만 수정
const response = await fetch(`/user/addresses/${addressId}`, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    alias: "새로운 별칭"
  })
});
const updatedAddress = await response.json();
```

---

### 7. 주소 삭제 (마이페이지 편집 모드)

**DELETE** `/user/addresses`

**인증**: JWT 토큰 필요

**요청 Body**:
```typescript
{
  ids: number[] // 삭제할 주소 ID 배열 (기본주소 제외, 1~3개)
}
```

**응답**:
```typescript
{
  message: "주소가 삭제되었습니다."
}
```

**사용 예시**:
```typescript
// 주소 삭제 (기본주소 제외, 1~3개 선택 삭제 가능)
const response = await fetch('/user/addresses', {
  method: 'DELETE',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    ids: [2] // 1개 삭제 (기본주소 제외)
    // ids: [2, 3] // 2개 삭제
    // ids: [2, 3, 4] // 3개 삭제
  })
});
const result = await response.json();
```

**주의사항**:
- **기본주소를 제외하고 최대 3개까지 삭제 가능**
- **기본주소는 삭제할 수 없음** (기본주소를 변경한 후 삭제해야 함)
- 기본주소가 포함된 배열을 전송하면 400 에러 발생
- **삭제는 soft delete로 실제 DB에서 삭제되지 않고 주소리스트에서만 안보이게 됨**
- 다른 주소를 추가하기 위해 기존 주소를 삭제할 수도 있음
- 검색 주소를 삭제하면 다른 주소가 자동으로 검색 주소로 설정됨
- 존재하지 않는 주소 ID가 포함되어 있으면 404 에러 발생
- 마이페이지 편집 모드에서 주소 리스트를 확인하고 삭제할 주소를 선택해서 삭제

---

### 8. 기본 주소 변경

**PATCH** `/user/addresses/:id/default`

**인증**: JWT 토큰 필요

**URL 파라미터**:
- `id`: 주소 ID (number)

**응답**:
```typescript
{
  id: number;
  roadAddress: string;
  postalCode: string | null;
  latitude: number;
  longitude: number;
  isDefault: boolean; // true로 변경됨
  isSearchAddress: boolean;
  alias: string | null;
  createdAt: Date;
  updatedAt: Date;
}
```

**사용 예시**:
```typescript
// 주소 리스트에서 기본 주소 변경
const response = await fetch(`/user/addresses/${addressId}/default`, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
const updatedAddress = await response.json();
```

**주의사항**:
- 기존 기본 주소는 자동으로 해제됨
- 기본주소를 변경한 후에 기존 기본주소를 삭제할 수 있음

---

### 9. 검색 주소 설정

**PATCH** `/user/addresses/:id/search`

**인증**: JWT 토큰 필요

**URL 파라미터**:
- `id`: 주소 ID (number)

**응답**:
```typescript
{
  id: number;
  roadAddress: string;
  postalCode: string | null;
  latitude: number;
  longitude: number;
  isDefault: boolean;
  isSearchAddress: boolean; // true로 변경됨
  alias: string | null;
  createdAt: Date;
  updatedAt: Date;
}
```

**사용 예시**:
```typescript
// 메뉴 추천/검색 시 사용할 주소 선택
const response = await fetch(`/user/addresses/${addressId}/search`, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
const updatedAddress = await response.json();
```

**주의사항**:
- 기존 검색 주소는 자동으로 해제됨
- 메뉴 추천 API 호출 시 `requestAddress`가 없으면 이 주소가 자동으로 사용됨

---

## 🎨 UI/UX 구현 가이드

### 1. 로그인 후 주소 정보 확인 및 팝업 표시

```typescript
// 로그인 후 주소 정보 확인
const LoginPage = () => {
  const handleLogin = async (email: string, password: string) => {
    const response = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const authResult = await response.json();
    
    // 주소 정보가 없으면 팝업 표시
    if (!authResult.address || !authResult.latitude || !authResult.longitude) {
      // 주소 등록 팝업 표시
      showAddressRegistrationModal();
    } else {
      // 정상적으로 로그인 완료
      navigate('/home');
    }
  };

  return (
    <div>
      <LoginForm onSubmit={handleLogin} />
      <AddressRegistrationModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={() => {
          setShowModal(false);
          navigate('/home');
        }}
      />
    </div>
  );
};

// 주소 등록 팝업 컴포넌트
const AddressRegistrationModal = ({ isOpen, onClose, onSuccess }) => {
  const [selectedAddress, setSelectedAddress] = useState(null);

  const handleSubmit = async () => {
    // PATCH /user/address 사용 (처음 주소 등록)
    const response = await fetch('/user/address', {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ selectedAddress })
    });
    
    if (response.ok) {
      onSuccess(); // 주소가 자동으로 기본주소로 설정됨
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <h2>주소를 등록해주세요</h2>
      <AddressSearch onSelect={setSelectedAddress} />
      <button onClick={handleSubmit}>등록하기</button>
    </Modal>
  );
};
```

### 2. 마이페이지 주소 리스트 화면

```typescript
// 주소 리스트 화면 컴포넌트
const AddressListPage = () => {
  const [addresses, setAddresses] = useState([]);
  const [defaultAddress, setDefaultAddress] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  useEffect(() => {
    fetchAddresses().then(setAddresses);
    fetchDefaultAddress().then(setDefaultAddress);
  }, []);

  const handleAddAddress = () => {
    // 주소 검색 화면으로 이동
    navigate('/addresses/search');
  };

  const handleSelectAddress = (id: number) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(selectedId => selectedId !== id));
    } else {
      if (selectedIds.length < 3) {
        setSelectedIds([...selectedIds, id]);
      }
    }
  };

  const handleDelete = async () => {
    if (selectedIds.length === 0) return;
    
    const response = await fetch('/user/addresses', {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ids: selectedIds })
    });
    
    if (response.ok) {
      // 주소 리스트 새로고침
      fetchAddresses().then(setAddresses);
      setSelectedIds([]);
      setIsEditMode(false);
    }
  };

  const handleSetDefault = async (id: number) => {
    const response = await fetch(`/user/addresses/${id}/default`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.ok) {
      fetchAddresses().then(setAddresses);
      fetchDefaultAddress().then(setDefaultAddress);
    }
  };

  return (
    <div>
      <h2>주소 관리</h2>
      
      {!isEditMode ? (
        <>
          {addresses.length < 4 && (
            <button onClick={handleAddAddress}>주소 추가</button>
          )}
          <button onClick={() => setIsEditMode(true)}>편집</button>
        </>
      ) : (
        <>
          <button onClick={handleDelete} disabled={selectedIds.length === 0}>
            삭제 ({selectedIds.length})
          </button>
          <button onClick={() => {
            setIsEditMode(false);
            setSelectedIds([]);
          }}>완료</button>
        </>
      )}
      
      {addresses.map(address => (
        <AddressCard
          key={address.id}
          address={address}
          isDefault={address.id === defaultAddress?.id}
          isSelected={selectedIds.includes(address.id)}
          isEditMode={isEditMode}
          canSelect={!address.isDefault && selectedIds.length < 3}
          onSelect={() => handleSelectAddress(address.id)}
          onSetDefault={() => handleSetDefault(address.id)}
          onSetSearch={() => handleSetSearch(address.id)}
          onEdit={() => handleEdit(address.id)}
        />
      ))}
    </div>
  );
};
```

### 3. 주소 추가 화면 (카카오 API 검색)

```typescript
// 주소 검색 및 추가 화면
const AddressAddPage = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedAddress, setSelectedAddress] = useState(null);
  const [alias, setAlias] = useState('');

  const handleSearch = async () => {
    const response = await fetch(`/user/address/search?query=${encodeURIComponent(searchQuery)}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const result = await response.json();
    setSearchResults(result.addresses);
  };

  const handleAdd = async () => {
    if (!selectedAddress) return;

    const response = await fetch('/user/addresses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        selectedAddress,
        alias: alias || undefined
      })
    });
    
    if (response.ok) {
      navigate('/addresses');
    }
  };

  return (
    <div>
      <h2>주소 추가</h2>
      <input
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="주소를 검색하세요"
      />
      <button onClick={handleSearch}>검색</button>
      
      <div>
        {searchResults.map((result, index) => (
          <div
            key={index}
            onClick={() => setSelectedAddress(result)}
            style={{
              backgroundColor: selectedAddress === result ? '#e0e0e0' : 'white'
            }}
          >
            <p>{result.roadAddress || result.address}</p>
            {result.postalCode && <p>우편번호: {result.postalCode}</p>}
          </div>
        ))}
      </div>
      
      {selectedAddress && (
        <div>
          <input
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            placeholder="별칭 (선택사항)"
          />
          <button onClick={handleAdd}>추가하기</button>
        </div>
      )}
    </div>
  );
};
```

---

## 🔄 상태 관리 예시 (React Query)

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// 주소 리스트 조회
const useAddresses = () => {
  return useQuery({
    queryKey: ['addresses'],
    queryFn: async () => {
      const response = await fetch('/user/addresses', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      return response.json();
    }
  });
};

// 기본 주소 조회
const useDefaultAddress = () => {
  return useQuery({
    queryKey: ['defaultAddress'],
    queryFn: async () => {
      const response = await fetch('/user/address/default', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      return response.json();
    }
  });
};

// 주소 추가
const useAddAddress = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: CreateUserAddressDto) => {
      const response = await fetch('/user/addresses', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addresses'] });
      queryClient.invalidateQueries({ queryKey: ['defaultAddress'] });
    }
  });
};

// 주소 삭제
const useDeleteAddresses = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (ids: number[]) => {
      const response = await fetch('/user/addresses', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ids })
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addresses'] });
      queryClient.invalidateQueries({ queryKey: ['defaultAddress'] });
    }
  });
};

// 기본 주소 설정
const useSetDefaultAddress = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (addressId: number) => {
      const response = await fetch(`/user/addresses/${addressId}/default`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addresses'] });
      queryClient.invalidateQueries({ queryKey: ['defaultAddress'] });
    }
  });
};

// 검색 주소 설정
const useSetSearchAddress = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (addressId: number) => {
      const response = await fetch(`/user/addresses/${addressId}/search`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addresses'] });
    }
  });
};
```

---

## ⚠️ 중요 주의사항

### 1. 최대 4개 제한
- 주소 추가 시 4개를 초과하면 400 에러가 발생합니다
- 삭제된 주소(soft delete)는 개수에 포함되지 않습니다

### 2. 기본 주소/검색 주소 유일성
- 기본 주소와 검색 주소는 각각 하나만 존재할 수 있습니다
- 새로운 주소를 기본/검색 주소로 설정하면 기존 주소는 자동으로 해제됩니다

### 3. 주소 삭제 규칙
- **기본주소는 삭제할 수 없습니다**
- 기본주소를 제외하고 최대 3개까지 삭제 가능
- 기본주소를 변경한 후에 기존 기본주소를 삭제할 수 있습니다
- 삭제는 soft delete로 실제 DB에서 삭제되지 않고 주소리스트에서만 안보이게 됩니다

### 4. 첫 번째 주소
- 첫 번째 주소는 `PATCH /user/address`로 등록하면 자동으로 기본 주소 및 검색 주소로 설정됩니다

### 5. 주소 추가 방식
- **여러 개를 한번에 추가하는 기능은 없습니다**
- 마이페이지에서 카카오 API로 주소를 검색한 후 하나씩 추가해야 합니다
- `POST /user/addresses/batch` 엔드포인트는 존재하지 않습니다

### 6. 인증
- 모든 엔드포인트는 JWT 토큰이 필요합니다
- 서버에서 자동으로 본인의 주소만 조회/수정/삭제할 수 있도록 검증합니다

---

## 📝 타입 정의

```typescript
// 주소 검색 결과
interface AddressSearchResult {
  address: string; // 지번주소
  roadAddress: string | null; // 도로명 주소
  postalCode: string | null; // 우편번호
  latitude: string; // 위도
  longitude: string; // 경도
}

// 주소 응답
interface UserAddressResponse {
  id: number;
  roadAddress: string;
  postalCode: string | null;
  latitude: number;
  longitude: number;
  isDefault: boolean;
  isSearchAddress: boolean;
  alias: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// 주소 추가 요청
interface CreateUserAddressDto {
  selectedAddress: AddressSearchResult;
  alias?: string;
  isDefault?: boolean;
  isSearchAddress?: boolean;
}

// 주소 삭제 요청
interface DeleteUserAddressesDto {
  ids: number[]; // 1~3개, 기본주소 제외
}
```

---

## 🔄 서비스 흐름 다이어그램

### 처음 회원가입 후 로그인 시

```
1. 사용자 로그인
   ↓
2. 서버에서 기본주소 조회 (UserAddress 리스트)
   ↓
3. 기본주소가 없으면 → address: null, latitude: null, longitude: null 반환
   ↓
4. 프론트엔드에서 주소 정보 확인
   ↓
5. 주소가 없으면 → 팝업 표시하여 주소 등록 유도
   ↓
6. 사용자가 주소 검색 후 등록
   ↓
7. PATCH /user/address 호출
   ↓
8. 서버에서 자동으로:
   - UserAddress 리스트에 추가
   - isDefault: true 설정
   - isSearchAddress: true 설정
   ↓
9. 이후 로그인 시 기본주소 정보가 자동으로 반환됨
```

### 마이페이지에서 주소 관리

```
1. 주소 리스트 조회 (GET /user/addresses)
   ↓
2. 주소 추가 버튼 클릭
   ↓
3. 카카오 API로 주소 검색 (GET /user/address/search)
   ↓
4. 검색 결과에서 주소 선택
   ↓
5. 하나씩 추가 (POST /user/addresses)
   ↓
6. 주소 리스트 새로고침
```

### 편집 모드에서 주소 삭제

```
1. 편집 버튼 클릭
   ↓
2. 기본주소를 제외한 주소들 중 1~3개 선택
   ↓
3. 삭제 버튼 클릭
   ↓
4. DELETE /user/addresses 호출 (ids 배열 전송)
   ↓
5. 서버에서 soft delete 처리
   ↓
6. 주소 리스트에서 안보이게 됨 (DB에는 남아있음)
```

---

## 🎯 체크리스트

프론트엔드 개발 시 확인사항:

- [ ] 로그인 응답에서 주소 정보 확인 및 팝업 표시
- [ ] 처음 주소 등록 시 `PATCH /user/address` 사용
- [ ] 마이페이지에서 주소 리스트 조회 (`GET /user/addresses`)
- [ ] 주소 추가 시 카카오 API 검색 후 하나씩 추가 (`POST /user/addresses`)
- [ ] **여러 개 한번에 추가하는 기능 제거** (`POST /user/addresses/batch` 사용 안 함)
- [ ] 편집 모드에서 기본주소 제외 1~3개 선택 삭제 (`DELETE /user/addresses`)
- [ ] 기본주소 변경 기능 (`PATCH /user/addresses/:id/default`)
- [ ] 검색주소 설정 기능 (`PATCH /user/addresses/:id/search`)
- [ ] 삭제 시 기본주소 체크 (기본주소는 삭제 불가)
- [ ] 최대 4개 제한 체크
