function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("active");
  document.getElementById("main").classList.toggle("shifted");
}

$(document).ready(function () {
  // Sidebar click behavior
  $(".nav-item").on("click", function () {
    $(".nav-item").removeClass("active");
    $(this).addClass("active");

    const target = $(this).data("target");
    const $section = $(target);

    $(".cv-section .details").slideUp(300);
    $(".cv-section").removeClass("active");

    $section.addClass("active");
    $section.find(".details").slideDown(400);

    $("html, body").animate({ scrollTop: $section.offset().top - 60 }, 600);

    if ($(window).width() < 900) {
      $("#sidebar").removeClass("active");
      $("#main").removeClass("shifted");
    }
  });

  // Hover reveal
  $(".cv-section").hover(
    function () {
      if (!$(this).hasClass("active"))
        $(this).find(".details").stop(true, true).slideDown(300);
    },
    function () {
      if (!$(this).hasClass("active"))
        $(this).find(".details").stop(true, true).slideUp(300);
    }
  );
});
