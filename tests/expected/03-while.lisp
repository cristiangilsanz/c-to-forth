(defun countdown ()
  (let* ((n 5))
    (loop while (> n 0) do
      (format t "~d... " n)
      (decf n))
    (format t "Lift off!~%")))

(defun main ()
  (countdown))

(main)
