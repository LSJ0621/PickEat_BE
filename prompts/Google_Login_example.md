

@Service
public class GoogleOauth2LoginSuccess extends SimpleUrlAuthenticationSuccessHandler {
    private final MemberRepository memberRepository;
    private final JwtTokenProvider jwtTokenProvider;

    public GoogleOauth2LoginSuccess(MemberRepository memberRepository, JwtTokenProvider jwtTokenProvider) {
        this.memberRepository = memberRepository;
        this.jwtTokenProvider = jwtTokenProvider;
    }

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request, HttpServletResponse response,
                                        Authentication authentication) throws IOException, ServletException {

//        oauth프로필 추출
        OAuth2User oAuth2User = (OAuth2User) authentication.getPrincipal();
        String openId = oAuth2User.getAttribute("sub");
        String email = oAuth2User.getAttribute("email");
//        회원가입 여부 확인
        Member member = memberRepository.findBySocialId(openId).orElse(null);
        if(member == null){
            member = Member.builder()
                    .socialId(openId)
                    .email(email)
                    .socialType(SocialType.GOOGLE)
                    .build();
            memberRepository.save(member);
        }
//        jwt토큰 생성
        String jwtToken = jwtTokenProvider.createToken(member.getEmail(), member.getRole().toString());

//        클라이언트 redirect 방식으로 토큰 전달
//        response.sendRedirect("http://localhost:3000?token="+jwtToken);

        Cookie jwtCookie = new Cookie("token", jwtToken);
        jwtCookie.setPath("/"); //모든 경로에서 쿠키 사용가능
        response.addCookie(jwtCookie);
        response.sendRedirect("http://localhost:3000");

    }

}


-----------


@Service
public class GoogleService {

    @Value("${oauth.google.client-id}")
    private String googleClientId;

    @Value("${oauth.google.client-secret}")
    private String googleClientSecret;

    @Value("${oauth.google.redirect-uri}")
    private String googleRedirectUri;


    public AccessTokenDto getAccessToken(String code){
//        인가코드, clientId, client_secret, redirect_uri, grant_type

//        Spring6부터 RestTemplate 비추천상태이기에, 대신 RestClient 사용
        RestClient restClient = RestClient.create();

//        MultiValueMap을 통해 자동으로 form-data형식으로 body 조립 가능
        MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
        params.add("code", code);
        params.add("client_id", googleClientId);
        params.add("client_secret", googleClientSecret);
        params.add("redirect_uri", googleRedirectUri);
        params.add("grant_type", "authorization_code");

        ResponseEntity<AccessTokenDto> response =  restClient.post()
                .uri("https://oauth2.googleapis.com/token")
                .header("Content-Type", "application/x-www-form-urlencoded")
//                ?code=xxxx&client_id=yyyy&
                .body(params)
//                retrieve:응답 body값만을 추출
                .retrieve()
                .toEntity(AccessTokenDto.class);

        System.out.println("응답 accesstoken JSON " + response.getBody());
        return response.getBody();
    }

    public GoogleProfileDto getGoogleProfile(String token){
        RestClient restClient = RestClient.create();
        ResponseEntity<GoogleProfileDto> response =  restClient.get()
                .uri("https://openidconnect.googleapis.com/v1/userinfo")
                .header("Authorization", "Bearer "+token)
                .retrieve()
                .toEntity(GoogleProfileDto.class);
        System.out.println("profile JSON" + response.getBody());
        return response.getBody();
    }
}