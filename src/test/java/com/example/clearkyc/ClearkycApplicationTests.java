package com.example.clearkyc;

import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

@SpringBootTest
class ClearkycApplicationTests {

	@MockitoBean
	private ChatModel chatModel;

	@Test
	void contextLoads() {
	}

}
